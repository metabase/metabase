export interface JSONReviverContext {
  source: string;
}

const INTEGER_REGEX = /^-?\d+$/;
function isInteger(value: string) {
  return INTEGER_REGEX.test(value);
}

const parse: typeof JSON.parse = (text, reviver) => {
  return JSON.parse(
    text,
    function revive(key, value, context?: JSONReviverContext) {
      const obj = this;

      const finalize = (val: any) =>
        reviver ? reviver.call(obj, key, val, context) : val;
      if (
        context?.source &&
        typeof value === "number" &&
        typeof context?.source === "string" &&
        (value < Number.MIN_SAFE_INTEGER || value > Number.MAX_SAFE_INTEGER) &&
        isInteger(context.source)
      ) {
        return finalize(context.source);
      }
      return finalize(value);
    },
  );
};

export const JSONBigInt = {
  parse,
  stringify: JSON.stringify,
};
