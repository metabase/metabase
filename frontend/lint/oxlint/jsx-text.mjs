import { decode } from "html-entities";

// JSX uses XML-style numeric references rather than HTML's Windows-1252
// replacements, and accepts a lowercase x for hexadecimal references.
export function decodeJsxText(text) {
  return text.replace(
    /&(?:#(\d+)|#x([\da-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
    (entity, decimal, hexadecimal, named) => {
      if (named) return decode(entity, { level: "html4", scope: "strict" });
      const codePoint = Number.parseInt(
        decimal ?? hexadecimal,
        decimal ? 10 : 16,
      );
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

// ESLint's JSX parsers expose decoded text. Oxlint exposes the source spelling;
// supply the upstream translation rule with the value it previously received.
export function withDecodedJsxText(plugin) {
  const rule = plugin.rules["no-literal-string"];
  return {
    ...plugin,
    rules: {
      ...plugin.rules,
      "no-literal-string": {
        ...rule,
        create(context) {
          const visitors = rule.create(context);
          return {
            ...visitors,
            JSXText(node) {
              const value = decodeJsxText(node.value);
              return visitors.JSXText(
                value === node.value
                  ? node
                  : Object.create(node, { value: { value } }),
              );
            },
          };
        },
      },
    },
  };
}
