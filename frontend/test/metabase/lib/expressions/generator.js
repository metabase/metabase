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
  for (let i = 0; i < 15; ++i) mathRandom();

  const randomInt = max => Math.floor(max * mathRandom());
  const randomItem = items => items[randomInt(items.length)];
  const oneOf = functions => () => randomItem(functions).apply(null, []);

  const id = () => String.fromCharCode(65 + randomInt(25));
  const field = () => {
    let name = id();
    while (mathRandom() < 0.7) name += id();
    return { type: "Field", field: name };
  };

  const zero = () => 0;
  const one = () => 1;
  const integer = () => randomInt(1e6);
  const number = () => oneOf([zero, one, integer])();

  const alphanum = () => String.fromCharCode(32 + randomInt(94));
  const string = () => {
    let str = alphanum();
    while (mathRandom() < 0.9) str += alphanum();
    return '"' + str + '"';
  };

  const literal = () => {
    return {
      type: "Literal",
      value: oneOf([number, string])(),
    };
  };

  const unary = () => {
    return {
      type: "Unary",
      op: randomItem("-", "NOT"),
      child: expression(),
    };
  };

  const binary = () => {
    return {
      type: "Binary",
      op: randomItem([
        "+",
        "-",
        "*",
        "/",
        "!=",
        "<=",
        ">=",
        "<",
        ">",
        "=",
        "AND",
        "OR",
      ]),
      left: expression(),
      right: expression(),
    };
  };

  const expression = () => oneOf([field, literal, unary, binary])();

  const format = node => {
    let str = null;
    const { type } = node;
    switch (type) {
      case "Field":
        str = "[" + node.field + "]";
        break;
      case "Literal":
        str = node.value;
        break;
      case "Unary":
        str = node.op + " " + format(node.child);
        break;
      case "Binary":
        str = format(node.left) + " " + node.op + " " + format(node.right);
        break;
    }

    if (str === null) throw new Error(`Unknown AST node ${type}`);
    return str;
  };

  const expr = expression();
  return format(expr);
}
