// Simple Fast Counter - as recommended by PRACTRAND
const sfc32 = (a, b, c, d) => {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
};

export function generateExpression(seed, type) {
  const u32seed = seed ^ 0xc0fefe;
  const mathRandom = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, u32seed);
  [...Array(15)].forEach(mathRandom);

  const randomInt = max => Math.floor(max * mathRandom());
  const randomItem = items => items[randomInt(items.length)];
  const oneOf = functions => () => randomItem(functions).apply(null, []);
  const listOf = (n, functions) => () =>
    [...Array(n)].map(_ => oneOf(functions)());

  const zero = () => 0;
  const one = () => 1;
  const integer = () => randomInt(1e6);
  const float1 = () => String(integer()) + ".";
  const float2 = () => float1() + String(integer());
  const float3 = () => String(integer()) + "." + String(integer());

  const string = () => '"' + characters() + '"';

  const uppercase = () => String.fromCharCode(65 + randomInt(26)); // A..Z
  const lowercase = () => String.fromCharCode(97 + randomInt(26)); // a..z
  const digit = () => String.fromCharCode(48 + randomInt(10)); // 0..9
  const underscore = () => "_";
  const space = () => " "; // FIXME: more whitespace family

  const characters = () => {
    // FIXME: include double-quote and escape it
    // FIXME: add more punctuations
    const charset = [uppercase, lowercase, digit, underscore, space];
    const len = randomInt(9);
    const start = oneOf(charset)();
    const part = listOf(len, charset)();
    return [start, ...part].join("");
  };

  const identifier = () => {
    const len = randomInt(7);
    const start = oneOf([uppercase, lowercase, underscore])();
    const part = listOf(len, [uppercase, lowercase, underscore, digit])();
    return [start, ...part].join("");
  };

  const NODE = {
    Literal: 1,
    Field: 2,
    Unary: 3,
    Binary: 4,
    FunctionCall: 5,
    Group: 6,
  };

  const format = node => {
    const spaces = () => listOf(1, [space, () => ""])().join("");
    const blank = ch => spaces() + ch + spaces();
    let str = null;
    const { type, value, op, left, right, child, params } = node;
    switch (type) {
      case NODE.Field:
      case NODE.Literal:
        str = value;
        break;
      case NODE.Unary:
        str = blank(op) + format(child);
        break;
      case NODE.Binary:
        str = format(left) + blank(op) + format(right);
        break;
      case NODE.FunctionCall:
        str = value + blank("(") + params.map(format).join(", ") + blank(")");
        break;
      case NODE.Group:
        str = blank("(") + format(child) + blank(")");
        break;
    }

    if (str === null) {
      throw new Error(`Unknown AST node ${type}`);
    }
    return String(str);
  };

  function generateTokenSeq() {
    const literal = () => {
      const exp = () => randomItem(["", "-", "+"]) + randomInt(1e2);
      const number = () => oneOf([zero, one, integer, float1, float2])();
      const sci = () => number() + randomItem(["e", "E"]) + exp();
      return {
        type: NODE.Literal,
        value: oneOf([number, sci, string])(),
      };
    };

    const field = () => {
      const fk = () => "[" + identifier() + " → " + identifier() + "]";
      const bracketedName = () => "[" + identifier() + "]";
      const name = oneOf([identifier, fk, bracketedName])();
      return {
        type: NODE.Field,
        value: name,
      };
    };

    const unary = () => {
      return {
        type: NODE.Unary,
        op: randomItem(["-", "NOT "]),
        child: expression(),
      };
    };

    const binary = () => {
      return {
        type: NODE.Binary,
        op: randomItem([
          "+",
          "-",
          "*",
          "/",
          "=",
          "!=",
          "<",
          ">",
          "<=",
          ">=",
          " AND ",
          " OR ",
        ]),
        left: expression(),
        right: expression(),
      };
    };

    const call = () => {
      const count = randomInt(5);
      return {
        type: NODE.FunctionCall,
        value: identifier(),
        params: listOf(count, [expression])(),
      };
    };

    const group = () => {
      return {
        type: NODE.Group,
        child: primary(),
      };
    };

    const primary = () => {
      --depth;
      const node = oneOf([field, literal, unary, binary, call, group])();
      ++depth;
      return node;
    };
    const expression = () => (depth <= 0 ? literal() : primary());

    const format = node => {
      const spaces = () => listOf(1, [space, () => ""])().join("");
      const blank = ch => spaces() + ch + spaces();
      let str = null;
      const { type, value, op, left, right, child, params } = node;
      switch (type) {
        case NODE.Field:
        case NODE.Literal:
          str = value;
          break;
        case NODE.Unary:
          str = blank(op) + format(child);
          break;
        case NODE.Binary:
          str = format(left) + blank(op) + format(right);
          break;
        case NODE.FunctionCall:
          str = value + blank("(") + params.map(format).join(", ") + blank(")");
          break;
        case NODE.Group:
          str = blank("(") + format(child) + blank(")");
          break;
      }

      if (str === null) {
        throw new Error(`Unknown AST node ${type}`);
      }
      return String(str);
    };

    let depth = 17;

    const tree = expression();
    return { tree, expression: format(tree) };
  }

  function generateValidSyntax(type) {
    // LIMITATION: known issue in the current Chevrotain-based parser

    const expression = () =>
      oneOf([numberExpression, booleanExpression, stringExpression])();

    const numberExpression = () => {
      --depth;
      const node =
        depth <= 0
          ? numberLiteral()
          : oneOf([
              numberLiteral,
              field,
              unaryMinus,
              binary,
              numberTransform,
              power,
              stringLength,
              numberGroup,
            ])();
      ++depth;
      return node;
    };

    const numberLiteral = () => {
      const exp = () => randomItem(["", "-", "+"]) + randomInt(1e2);
      const number = () => oneOf([zero, one, integer, float3])(); // LIMITATION: no dangling decimal point, e.g. "3."
      const sci = () => number() + randomItem(["e", "E"]) + exp();
      return {
        type: NODE.Literal,
        value: oneOf([number, sci])(),
      };
    };

    const validIdentifier = () => {
      const KEYWORDS = ["and", "or", "not"];
      let candidate;
      do {
        candidate = identifier();
      } while (KEYWORDS.includes(candidate.toLowerCase()));
      return candidate;
    };

    const field = () => {
      const fk = () => "[" + identifier() + " → " + identifier() + "]";
      const bracketedName = () => "[" + identifier() + "]";
      const name = oneOf([validIdentifier, fk, bracketedName])();
      return {
        type: NODE.Field,
        value: name,
      };
    };

    // LIMITATION: no negative on negative, e.g. "--4"
    const unaryMinus = () => {
      return {
        type: NODE.Unary,
        op: "-",
        child: oneOf([numberLiteral])(),
      };
    };

    const binary = () => {
      return {
        type: NODE.Binary,
        op: randomItem(["+", "-", "*", "/"]),
        left: numberExpression(),
        right: numberExpression(),
      };
    };

    const numberTransform = () => {
      return {
        type: NODE.FunctionCall,
        value: randomItem([
          "abs",
          "ceil",
          "exp",
          "floor",
          "log",
          "round",
          "sqrt",
        ]),
        params: [numberExpression()],
      };
    };

    const power = () => {
      return {
        type: NODE.FunctionCall,
        value: "power",
        params: listOf(2, [numberExpression])(),
      };
    };

    const stringLength = () => {
      return {
        type: NODE.FunctionCall,
        value: "length",
        params: [stringExpression()],
      };
    };

    const numberGroup = () => {
      return {
        type: NODE.Group,
        child: numberExpression(),
      };
    };

    const booleanExpression = () => {
      --depth;
      const node =
        depth <= 0
          ? field()
          : oneOf([
              field,
              logicalNot,
              logicalBinary,
              comparison,
              stringCheck,
              valueCheck,
              dateCheck,
              logicalGroup,
            ])();
      ++depth;
      return node;
    };

    // LIMITATION: no NOT on NOT, e.g. "NOT NOT [HighlyRated]"
    const logicalNot = () => {
      return {
        type: NODE.Unary,
        op: "NOT ",
        child: oneOf([field, comparison, logicalGroup])(),
      };
    };

    const logicalBinary = () => {
      return {
        type: NODE.Binary,
        op: randomItem([" AND ", " OR "]),
        left: booleanExpression(),
        right: booleanExpression(),
      };
    };

    const comparison = () => {
      return {
        type: NODE.Binary,
        op: randomItem(["=", "!=", "<", ">", "<=", ">="]),
        left: numberExpression(),
        right: numberExpression(),
      };
    };

    const stringCheck = () => {
      return {
        type: NODE.FunctionCall,
        value: randomItem(["contains", "startsWith", "endsWith"]),
        params: listOf(2, [stringExpression])(),
      };
    };

    const valueCheck = () => {
      return {
        type: NODE.FunctionCall,
        value: randomItem(["isNull", "isEmpty"]),
        params: [field()], // LIMITATION: only works on fields
      };
    };

    const dateCheck = () => oneOf([betweenDates, intervalDates])();

    const betweenDates = () => {
      return {
        type: NODE.FunctionCall,
        value: "between",
        params: [field(), stringExpression(), stringExpression()],
      };
    };

    const intervalDates = () => {
      return {
        type: NODE.FunctionCall,
        value: "interval",
        params: [field(), numberExpression(), stringExpression()],
      };
    };

    const logicalGroup = () => {
      return {
        type: NODE.Group,
        child: booleanExpression(),
      };
    };

    const stringExpression = () => {
      --depth;
      const node =
        depth <= 0
          ? stringLiteral()
          : oneOf([
              stringLiteral,
              field,
              stringConcat,
              stringTransform,
              stringReplace,
              substring,
              regexextract,
            ])();
      ++depth;
      return node;
    };

    const stringLiteral = () => {
      return {
        type: NODE.Literal,
        value: string(),
      };
    };

    const stringConcat = () => {
      const count = 1 + randomInt(5);
      return {
        type: NODE.FunctionCall,
        value: "concat",
        params: listOf(count, [stringExpression])(),
      };
    };

    const stringTransform = () => {
      return {
        type: NODE.FunctionCall,
        value: randomItem(["ltrim", "trim", "rtrim", "lower", "upper"]),
        params: [stringExpression()],
      };
    };

    const stringReplace = () => {
      return {
        type: NODE.FunctionCall,
        value: "replace",
        params: [field(), stringExpression(), stringExpression()],
      };
    };

    const substring = () => {
      return {
        type: NODE.FunctionCall,
        value: "substring",
        params: [stringExpression(), numberExpression(), numberExpression()],
      };
    };

    const regexextract = () => {
      return {
        type: NODE.FunctionCall,
        value: "regexextract",
        params: [field(), stringLiteral()], // FIXME: maybe regexpLiteral?
      };
    };

    let depth = 13;

    let tree;
    switch (type) {
      case "boolean":
      case "filter":
        tree = booleanExpression();
        break;

      case "number":
        tree = numberExpression();
        break;

      case "string":
        tree = stringExpression();
        break;

      case "expression":
        tree = expression();
        break;

      default:
        throw new Error(`Unknown expression type ${type}`);
    }

    return { tree, expression: format(tree) };
  }

  return type ? generateValidSyntax(type) : generateTokenSeq();
}
