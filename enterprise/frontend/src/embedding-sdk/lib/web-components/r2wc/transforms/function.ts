import type { Transform } from "./transforms";

function generateHash(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0; // Constrain to 32bit integer
  }

  return hash.toString();
}

export const functionTransform: Transform<(...args: unknown[]) => unknown> = {
  stringify: (value: (...args: unknown[]) => void) => {
    if (!value) {
      return "";
    }

    const hash = generateHash(value.toString());

    // Prefix it to avoid indexed Window property assignment
    const identifier = ["fn", value.name, hash].filter(Boolean).join("-");

    // @ts-expect-error global object access
    if (!window[identifier]) {
      // @ts-expect-error global object access
      window[identifier] = value;
    }

    return identifier;
  },
  parse: (value: string) => {
    // @ts-expect-error global object access
    if (window[value]) {
      // @ts-expect-error global object access
      return window[value];
    }

    return undefined;
  },
};
