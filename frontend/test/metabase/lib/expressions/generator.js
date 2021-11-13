import { createRandom } from "./prng";

export function generateExpression(seed, depth = 13) {
  const random = createRandom(seed);

  const randomInt = max => Math.floor(max * random());
  const randomItem = items => items[randomInt(items.length)];
  const oneOf = functions => () => randomItem(functions).apply(null, []);
  const listOf = (n, functions) => () =>
    [...Array(n)].map(_ => oneOf(functions)());

  const zero = () => 0;
  const one = () => 1;
  const integer = () => randomInt(1e6);
  const float = () => String(integer()) + "." + String(integer());

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
    const number = () => oneOf([zero, one, integer, float])(); // LIMITATION: no dangling decimal point, e.g. "3."
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

  const tree = oneOf([numberExpression, booleanExpression, stringExpression])();

  const expression = format(tree);

  return { tree, expression };
}
