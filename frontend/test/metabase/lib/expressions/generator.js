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

export function generateExpression(seed) {
  const u32seed = seed ^ 0xc0fefe;
  const mathRandom = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, u32seed);
  [...Array(15)].forEach(mathRandom);

  const randomInt = max => Math.floor(max * mathRandom());
  const randomItem = items => items[randomInt(items.length)];
  const oneOf = functions => () => randomItem(functions).apply(null, []);
  const listOf = (n, functions) => () =>
    [...Array(n)].map(_ => oneOf(functions)());

  const NODE = {
    Literal: 1,
    Field: 2,
    Unary: 3,
    Binary: 4,
    FunctionCall: 5,
  };

  const zero = () => 0;
  const one = () => 1;
  const integer = () => randomInt(1e6);
  const number = () => oneOf([zero, one, integer])();

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

  const literal = () => {
    --depth;
    const string = () => '"' + characters() + '"';
    return {
      type: NODE.Literal,
      value: oneOf([number, string])(),
    };
  };

  const identifier = () => {
    const len = randomInt(7);
    const start = oneOf([uppercase, lowercase, underscore])();
    const part = listOf(len, [uppercase, lowercase, underscore, digit])();
    return [start, ...part].join("");
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
      op: randomItem(["-", "NOT"]),
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
        "AND",
        "OR",
      ]),
      left: expression(),
      right: expression(),
    };
  };

  const call = () => {
    const count = randomInt(5);
    return {
      type: NODE.FunctionCall,
      name: identifier(),
      params: listOf(count, [expression])(),
    };
  };

  const primary = () => {
    --depth;
    const node = oneOf([field, literal, unary, binary, call])();
    ++depth;
    return node;
  };
  const expression = () => (depth <= 0 ? literal() : primary());

  const format = node => {
    let str = null;
    const { type } = node;
    switch (type) {
      case NODE.Field:
      case NODE.Literal:
        str = node.value;
        break;
      case NODE.Unary:
        str = node.op + " " + format(node.child);
        break;
      case NODE.Binary:
        str = format(node.left) + " " + node.op + " " + format(node.right);
        break;
      case NODE.FunctionCall:
        str = node.name + "(" + node.params.map(format).join(",") + ")";
        break;
    }

    if (str === null) {
      throw new Error(`Unknown AST node ${type}`);
    }
    return str;
  };

  let depth = 131; // Iodine isotope

  const tree = expression();
  return { tree, expression: format(tree) };
}
