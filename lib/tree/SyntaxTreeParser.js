import antlr4 from 'antlr4';
import JavaScriptLexer from '../language/JavaScriptLexer.js';
import JavaScriptParser from '../language/JavaScriptParser.js';
import JavaScriptSimpleParseTree from './JavaScriptSimpleParseTree.js';
import JavaScriptSimpleParseTreeNode from './JavaScriptSimpleParseTreeNode.js';

class SyntaxTreeParser {
  constructor(input) {
    const chars = new antlr4.InputStream(input);
    const lexer = new JavaScriptLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    const parser = new JavaScriptParser(tokens);
    const ruleNames = parser.ruleNames;
    const symbolicNames = parser.symbolicNames;
    parser.buildParseTrees = true;
    const syntaxTree = parser.program();

    this.tokens = tokens;
    this.ruleNames = ruleNames;
    this.symbolicNames = symbolicNames;
    this.syntaxTree = syntaxTree;
  }

  /**
   * Construct a JavaScriptSimpleParseTree from an ANTLR syntax tree.
   */
  generateTree() {
    const leafNodeRuleNames = [
      'identifier',
      'literal',
      'arrayLiteral',
      'objectLiteral',
      'templateStringLiteral',
      'numericLiteral',
      'bigintLiteral',
    ];

    const LeafNodeSymbolicNames = [
      'RegularExpressionLiteral',
      'NullLiteral',
      'BooleanLiteral',
      'DecimalLiteral',
      'HexIntegerLiteral',
      'OctalIntegerLiteral',
      'OctalIntegerLiteral2',
      'BinaryIntegerLiteral',
      'BigHexIntegerLiteral',
      'BigOctalIntegerLiteral',
      'BigBinaryIntegerLiteral',
      'BigDecimalIntegerLiteral',
      'Identifier',
      'StringLiteral',
    ];

    const leadingOrTrailingText = (tokenSymbol, leading) => {
      if (!tokenSymbol) return;
      const tokenList = leading ? this.tokens.getHiddenTokensToLeft(tokenSymbol.tokenIndex, 1)
                                : this.tokens.getHiddenTokensToRight(tokenSymbol.tokenIndex, 1);
      if (!tokenList || tokenList.length === 0) return;
      let tokenStr = '';
      tokenList.forEach((t) => {
        tokenStr += t.text;
      });
      return tokenStr;
    };

    const traverseTree = (treeNode, depth = 0) => {
      let childCount = treeNode.getChildCount();
      if (childCount === 0) {
        return null;
      }
      const simpleParseTree = new JavaScriptSimpleParseTree();
      let treeLabel = '';
      for (let i = 0; i < childCount; i++) {
        const subTree = treeNode.getChild(i);
        if (subTree.constructor.name === 'TerminalNodeImpl') {
          let treeText = subTree.getText();
          if (treeText !== '<EOF>') {
            const ruleName = subTree.getRuleContext ? subTree.getRuleContext().ruleIndex : null;
            const tokenSymbol = subTree.getSymbol ? subTree.getSymbol() : null;
            let isLeaf = false;
            let isVariable = false;
            let isCapitalized = false;
            if ((ruleName && leafNodeRuleNames.includes(this.ruleNames[ruleName]))
              || LeafNodeSymbolicNames.includes(this.symbolicNames[tokenSymbol.type])) {
              isLeaf = true;
              treeLabel = treeLabel + '#';
              if (tokenSymbol && this.symbolicNames[tokenSymbol.type] === 'Identifier') {
                isVariable = true;
                const firstLetter = treeText[0];
                isCapitalized = firstLetter.toUpperCase() === firstLetter && firstLetter.toLowerCase() !== firstLetter;
              }
            } else {
              isLeaf = false;
              treeLabel = treeLabel + treeText;
            }
            const newNode = new JavaScriptSimpleParseTreeNode({
              token: treeText,
              isLeaf: isLeaf ? true : undefined,
              isVariable: isVariable ? true : undefined,
              isCapitalized: isCapitalized ? true : undefined,
              leading: leadingOrTrailingText(tokenSymbol, true),
              trailing: leadingOrTrailingText(tokenSymbol, false),
            });
            simpleParseTree.children.push(newNode);
          }
        } else {
          const traversedSubTree = traverseTree(subTree, depth + 1);
          if (traversedSubTree && traversedSubTree.label) {
            if (traversedSubTree.children && traversedSubTree.children.length === 1) {
              simpleParseTree.children.push(traversedSubTree.children[0]);
              treeLabel = treeLabel + traversedSubTree.label;
            } else {
              simpleParseTree.children.push(traversedSubTree);
              treeLabel = treeLabel + '#';
            }
          }
        }
      }

      simpleParseTree.label = treeLabel;
      return simpleParseTree;
    };

    return traverseTree(this.syntaxTree);
  }

  /**
   * Util function to return all leaf nodes of an ANTLR parse tree.
   *
   * @param {object} tree The parse tree
   * @param {int} depth The current depth of the travesal
   * @param {Array} result The result array containing all leaf nodes
   * @returns The result array
   */
  static treeLeafNodes(tree, depth, result) {
    if (!depth)
      depth = 0;
    if (!result)
      result = [];
    for (let i = 0; i < tree.getChildCount(); i++) {
      const child = tree.getChild(i);
      if (child.constructor.name === 'TerminalNodeImpl') {
        result.push(child.getText());
      } else {
        SyntaxTreeParser.treeLeafNodes(child, depth + 1, result);
      }
    }
    return result;
  }

  /**
   * @private
   * Consutrct a JSON tree structure from the LISP stringified tree.
   * @param {string} input The stringified tree in the LISP format
   * @returns The tree structure represented in JSON format, with each node
   *          having its value and children nodes.
   */
  static makeTreeFromString(input) {
    let root;
    let stack = [];
    let id = 0;
    let currentNode;
    for(let i = 0; i < input.length; i++) {
      if ((input.charAt(i) === '(' || input.charAt(i) === ')' ) && input.charAt(i - 1) == ' ' && input.charAt(i + 1) == ' ') {
        if (currentNode)
            currentNode.value = currentNode.value + input.charAt(i);
        continue;
      }
      switch (input.charAt(i)) {
        case '(': {
          const newNode = { id: id++, value: '', children: [] };
          if (id === 1)
            root = newNode;
          if (currentNode) {
              currentNode.children.push(newNode);
          }
          stack.push(newNode);
          currentNode = newNode;
          break;
        }
        case ')': {
          stack.pop();
          if (stack.length > 0) {
            currentNode = stack[stack.length - 1];
          }
          break;
        }
        default: {
          if (currentNode)
            currentNode.value = currentNode.value + input.charAt(i);
          break;
        }
      }
    }
    return root;
  }

  /**
   * Util functions to pretty-print the ANTLR tree structure.
   * @param {object} tree The stringified tree structure
   * @returns Pretty-printed tree structure
   */
  static printStringTree(tree) {
    const recur = ({ id, value, children }) => id + ' ' + value +
        (children?.length ? '\n' + children.map(recur).map((text, i, {length}) =>
            i < length-1 ? '├──' + text.replace(/\n/g, '\n│  ')
                        : '└──' + text.replace(/\n/g, '\n   ')
        ).join('\n') : '');
    return [SyntaxTreeParser.makeTreeFromString(tree)].map(recur).join('\n');
  }
}

export default SyntaxTreeParser;