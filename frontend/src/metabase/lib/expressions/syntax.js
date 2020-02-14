import _ from "underscore";

import { ExpressionCstVisitor, parse as parserParse } from "./parser";

const syntax = (type, ...rest) => {
  const children = rest.filter(child => child);
  return {
    type: type,
    children: children,
    // start: (children[0] || {}).start,
    // end: (children[children.length - 1] || {}).end,
  };
};

const token = token =>
  token && {
    type: "token",
    text: token.image,
    start: token.startOffset,
    end: token.endOffset,
  };

export class ExpressionSyntaxVisitor extends ExpressionCstVisitor {
  constructor(options) {
    super();
    this._options = options;
    this.validateVisitor();
  }

  expression(ctx) {
    return this.visit(ctx.additionExpression);
  }
  aggregation(ctx) {
    return this.visit(ctx.additionExpression);
  }

  additionExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }
  multiplicationExpression(ctx) {
    return this._arithmeticExpression(ctx);
  }

  _arithmeticExpression(ctx) {
    const initial = [this.visit(ctx.lhs)];

    if (ctx.rhs) {
      //initial = initial.concat(...ctx.rhs.map((node) => this.visit(node)));
      for (const index of ctx.rhs.keys()) {
        const operator = token(ctx.operator[index]);
        const operand = this.visit(ctx.rhs[index]);
        // collapse multiple consecutive operators into a single MBQL statement
        initial.push(operator);
        initial.push(operand);
      }
    }

    return syntax("math", ...initial);
  }

  aggregationExpression(ctx) {
    const args = ctx.call ? this.visit(ctx.call) : [];
    return syntax("aggregation expression", token(ctx.aggregation[0]), ...args);
  }

  nullaryCall(ctx) {
    return [token(ctx.LParen[0]), token(ctx.RParen[0])];
  }
  unaryCall(ctx) {
    return [
      token(ctx.LParen[0]),
      this.visit(ctx.expression),
      token(ctx.RParen[0]),
    ];
  }
  metricExpression(ctx) {
    throw "not yet implemented";
  }
  dimensionExpression(ctx) {
    const dimensionName = this.visit(ctx.dimensionName);
    if (dimensionName.children[0].name === "identifier") {
      return syntax("field", dimensionName);
    } else {
      return dimensionName;
    }
  }

  identifier(ctx) {
    return syntax("identifier", token(ctx.Identifier[0]));
  }
  stringLiteral(ctx) {
    return syntax("string", token(ctx.StringLiteral[0]));
  }
  numberLiteral(ctx) {
    return syntax("number", token(ctx.Minus), token(ctx.NumberLiteral[0]));
  }
  atomicExpression(ctx) {
    return this.visit(ctx.expression);
  }
  parenthesisExpression(ctx) {
    return syntax(
      "group",
      token(ctx.LParen[0]),
      this.visit(ctx.expression),
      token(ctx.RParen[0]),
    );
  }
}

// const syntax = (type, ...children) => ({
//   type: type,
//   children: children.filter(child => child),
// });
// const token = token =>
//   token && {
//     type: "token",
//     text: token.image,
//     start: token.startOffset,
//     end: token.endOffset,
//   };

// class ExpressionsParserSyntax extends ExpressionsParser {
//   _math(initial, operations) {
//     return syntax(
//       "math",
//       ...[initial].concat(...operations.map(([op, arg]) => [token(op), arg])),
//     );
//   }
//   _aggregation(aggregation, lParen, arg, rParen) {
//     return syntax(
//       "aggregation",
//       token(aggregation),
//       token(lParen),
//       arg,
//       token(rParen),
//     );
//   }
//   _metricReference(metricName, metricId) {
//     return syntax("metric", metricName);
//   }
//   _dimensionReference(dimensionName, dimension) {
//     return syntax("field", dimensionName);
//   }
//   _unknownField(fieldName) {
//     return syntax("unknown", fieldName);
//   }
//   _unknownMetric(metricName) {
//     return syntax("unknown", metricName);
//   }

//   _identifier(identifier) {
//     return syntax("identifier", token(identifier));
//   }
//   _stringLiteral(stringLiteral) {
//     return syntax("string", token(stringLiteral));
//   }
//   _numberLiteral(minus, numberLiteral) {
//     return syntax("number", token(minus), token(numberLiteral));
//   }
//   _parens(lParen, expValue, rParen) {
//     return syntax("group", token(lParen), expValue, token(rParen));
//   }
//   _toString(x) {
//     if (typeof x === "string") {
//       return x;
//     } else if (x.type === "string") {
//       return JSON.parse(x.children[0].text);
//     } else if (x.type === "identifier") {
//       return x.children[0].text;
//     }
//   }
// }

export function parse(source, { whitespace = true, ...options } = {}) {
  const cst = parserParse(source, options);
  const vistor = new ExpressionSyntaxVisitor(options);
  const tree = vistor.visit(cst);
  if (whitespace) {
    return recoverWhitespace(tree, source);
  } else {
    return tree;
  }
}

// inserts whitespace tokens back into the syntax tree
function recoverWhitespace(root, source) {
  const node = _recoverWhitespace(root, source);
  if (node.start > 0) {
    node.children.unshift({ text: source.substring(0, node.start) });
    node.start = 0;
  }
  if (node.end < source.length - 1) {
    node.children.push({ text: source.substring(node.end + 1) });
    node.end = source.length - 1;
  }
  return node;
}
function _recoverWhitespace(node, source) {
  if (node.children) {
    const children = [];
    let previous = null;
    for (const child of node.children) {
      // call recoverWhitespace on the child first to get start/end on non-terminals
      const current = _recoverWhitespace(child, source);
      // if the current node doesn't start where the previous node ended then add whitespace token back in
      if (previous && current.start > previous.end + 1) {
        children.push({
          text: source.substring(previous.end + 1, current.start),
        });
      }
      children.push(current);
      previous = current;
    }
    return {
      ...node,
      children,
      // add start/end to non-terminals
      start: children[0].start,
      end: children[children.length - 1].end,
    };
  } else {
    return node;
  }
}

export function serialize(node) {
  if (node.children) {
    return node.children.map(serialize).join("");
  } else {
    return node.text || "";
  }
}
