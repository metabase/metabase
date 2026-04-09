type Generator<T> = () => T;

type Node = {
  type: number;
  value?: number | string;
  params?: Node[];
  left?: Node;
  right?: Node;
  child?: Node;
  op?: string;
};

function assert<T>(x: T | null | undefined): asserts x is T {
  if (x === null || x === undefined) {
    throw new Error("Assertion failed");
  }
}

export function generateExpression(
  seed: number,
  resultType?: "boolean" | "number" | "string" | "expression",
  depth: number = 13,
) {
  const random = createRandom(seed);

  const randomInt = (max: number): number => Math.floor(max * random());
  const randomItem = <T>(items: T[]): T => items[randomInt(items.length)];
  const oneOf =
    <T>(generators: Generator<T>[]): Generator<T> =>
    () =>
      randomItem(generators).apply(null, []);
  const listOf =
    <T>(n: number, generators: Generator<T>[]) =>
    () =>
      [...Array(n)].map(() => oneOf(generators)());

  const zero = () => 0;
  const one = () => 1;
  const integer = () => randomInt(1e6);
  const float1 = () => String(integer()) + ".";
  const float2 = () => "." + String(integer());
  const float3 = () => String(integer()) + "." + String(integer());

  const string = () => '"' + characters() + '"';

  const uppercase = () => String.fromCharCode(65 + randomInt(26)); // A..Z
  const lowercase = () => String.fromCharCode(97 + randomInt(26)); // a..z
  const digit = () => String.fromCharCode(48 + randomInt(10)); // 0..9
  const underscore = () => "_";
  const space = () => " "; // FIXME: more whitespace family

  const characters = () => {
    // FIXME: include double-quote and escape it
    // FIXME: add more punctuation
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

  const randomizeCase = (str: string) =>
    str
      .split("")
      .map((ch) => (randomInt(10) < 3 ? ch.toUpperCase() : ch))
      .join("");

  const format = (node: Node): string => {
    const spaces = () => listOf(1, [space, () => ""])().join("");
    const blank = (ch: string) => spaces() + ch + spaces();
    let str = null;
    const { type, value, op, left, right, child, params } = node;
    switch (type) {
      case NODE.Field:
      case NODE.Literal:
        str = value;
        break;
      case NODE.Unary:
        assert(op);
        assert(child);
        str = blank(op) + format(child);
        break;
      case NODE.Binary:
        assert(left);
        assert(op);
        assert(right);
        str = format(left) + blank(op) + format(right);
        break;
      case NODE.FunctionCall:
        assert(value);
        assert(params);
        if (typeof value !== "string") {
          throw new Error("Unexpected value type");
        }
        str =
          randomizeCase(value) +
          blank("(") +
          params.map(format).join(", ") +
          blank(")");
        break;
      case NODE.Group:
        assert(child);
        str = blank("(") + format(child) + blank(")");
        break;
    }

    if (str === null) {
      throw new Error(`Unknown AST node ${type}`);
    }
    return String(str);
  };

  const coalesce = (fn: Generator<Node>): Node => {
    return {
      type: NODE.FunctionCall,
      value: "coalesce",
      params: listOf<Node>(1 + randomInt(3), [fn])(),
    };
  };

  const caseExpression = (fn: Generator<Node>): Node => {
    const params: Node[] = [];
    for (let i = 0; i < 1 + randomInt(3); ++i) {
      params.push(booleanExpression());
      params.push(fn());
    }
    if (randomInt(10) < 3) {
      params.push(fn());
    }
    return {
      type: NODE.FunctionCall,
      value: "case",
      params,
    };
  };

  const numberExpression = (): Node => {
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
            coalesceNumber,
            caseNumber,
          ])();
    ++depth;
    return node;
  };

  const numberLiteral = (): Node => {
    const exp = () => randomItem(["", "-", "+"]) + randomInt(1e2);
    const number = () =>
      oneOf<number | string>([zero, one, integer, float1, float2, float3])();
    const sci = (): string => number() + randomItem(["e", "E"]) + exp();
    return {
      type: NODE.Literal,
      value: oneOf([number, sci])(),
    };
  };

  const field = () => {
    const fk = () => "[" + identifier() + " → " + identifier() + "]";
    const bracketedName = () => "[" + identifier() + "]";
    const name = oneOf([fk, bracketedName])();
    return {
      type: NODE.Field,
      value: name,
    };
  };

  const unaryMinus = () => {
    return {
      type: NODE.Unary,
      op: "-",
      child: numberExpression(),
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

  const coalesceNumber = () => coalesce(numberExpression);

  const caseNumber = () => caseExpression(numberExpression);

  const booleanExpression = (): Node => {
    --depth;
    const node =
      depth <= 0
        ? field()
        : oneOf<Node>([
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

  const logicalNot = () => {
    return {
      type: NODE.Unary,
      op: "NOT ",
      child: booleanExpression(),
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
    const isNumberValue = (value: number | string | undefined) =>
      typeof value === "number" ||
      (typeof value === "string" && value[0] !== '"');

    const isValidLHS = (node: Node): boolean => {
      const { type, value, op, child } = node;
      if (type === NODE.Literal && isNumberValue(value)) {
        return false;
      }
      if (type === NODE.Unary && op === "-") {
        return false;
      }
      if (type === NODE.Group) {
        assert(child);
        return isValidLHS(child);
      }
      return true;
    };

    // LIMITATION: no number literal on the left-hand side
    let left = numberExpression();
    if (!isValidLHS(left)) {
      left = field();
    }

    return {
      type: NODE.Binary,
      op: randomItem(["=", "!=", "<", ">", "<=", ">="]),
      left,
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

  const stringExpression = (): Node => {
    --depth;
    const node =
      depth <= 0
        ? stringLiteral()
        : oneOf<Node>([
            stringLiteral,
            field,
            stringConcat,
            stringTransform,
            stringReplace,
            substring,
            regexextract,
            coalesceString,
            caseString,
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

  const coalesceString = () => coalesce(stringExpression);

  const caseString = () => caseExpression(stringExpression);

  const generatorFunctions = [];
  switch (resultType) {
    case "boolean":
      generatorFunctions.push(booleanExpression);
      break;
    case "number":
      generatorFunctions.push(numberExpression);
      break;
    case "string":
      generatorFunctions.push(stringExpression);
      break;
    // alias for number | string
    case "expression":
      generatorFunctions.push(numberExpression);
      generatorFunctions.push(stringExpression);
      break;

    default:
      generatorFunctions.push(booleanExpression);
      generatorFunctions.push(numberExpression);
      generatorFunctions.push(stringExpression);
      break;
  }

  const tree = oneOf(generatorFunctions)();
  const expression = format(tree);

  return { tree, expression };
}

// Simple Fast Counter - as recommended by PRACTRAND
function sfc32(a: number, b: number, c: number, d: number) {
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
}

export function createRandom(seed: number): () => number {
  const u32seed = seed ^ 0xc0fefe;
  const mathRandom = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, u32seed);
  [...Array(15)].forEach(mathRandom);
  return mathRandom;
}
