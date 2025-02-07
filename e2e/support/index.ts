import * as OriginalHelpers from "./helpers";
import { logGroup } from "./logGroup";

const formatArgs = (args: any[]): string[] => {
  try {
    if (args.length === 0) {
      return [""];
    }
    return args.map(arg => {
      if (arg === undefined) {
        return "undefined";
      }
      if (arg === null) {
        return "null";
      }
      if (typeof arg === "object") {
        try {
          return JSON.stringify(arg, null, 1);
        } catch {
          return "[Complex Object]";
        }
      }
      return String(arg);
    });
  } catch (e) {
    return ["Unable to stringify args"];
  }
};

// Helper functions that should not be wrapped (they just return data)
const DATA_ONLY_HELPERS = new Set([
  "getTextCardDetails",
  "getActionCardDetails",
  // Add other data-only helpers here
]);

const isCypressCommand = (result: any) => {
  return (
    result &&
    (typeof result.then === "function" ||
      result.constructor?.name === "chainer" ||
      (typeof result === "object" && result.jquery))
  );
};

const wrapFunction = (key: string, fn: (...args: any[]) => any) => {
  // Skip wrapping for data-only helpers
  if (DATA_ONLY_HELPERS.has(key)) {
    return fn;
  }

  return (...args: any[]) => {
    // First call the function to check its result
    const result = fn(...args);

    // If the result is not a Cypress command, return it directly
    if (!isCypressCommand(result)) {
      return result;
    }

    // Only wrap with logGroup if it returns a Cypress command
    return logGroup(
      cy,
      {
        name: key,
        displayName: `H.${key}`,
        message: formatArgs(args),
      },
      () => result,
    );
  };
};

const wrapObject = (key: string, obj: Record<string, any>) => {
  return Object.entries(obj).reduce(
    (acc, [methodKey, method]) => {
      if (typeof method === "function") {
        acc[methodKey] = wrapFunction(`${key}.${methodKey}`, method.bind(obj));
      } else if (method && typeof method === "object") {
        acc[methodKey] = wrapObject(`${key}.${methodKey}`, method);
      } else {
        acc[methodKey] = method;
      }
      return acc;
    },
    {} as Record<string, any>,
  );
};

const wrappedHelpers = Object.entries(OriginalHelpers).reduce<
  Record<string, any>
>((acc, [key, helper]) => {
  if (typeof helper === "function") {
    acc[key] = wrapFunction(key, helper);
  } else if (helper && typeof helper === "object") {
    acc[key] = wrapObject(key, helper);
  } else {
    acc[key] = helper;
  }
  return acc;
}, {});

const H = wrappedHelpers;

type HelperTypes = typeof OriginalHelpers;

declare global {
  namespace Cypress {
    interface Chainable extends HelperTypes {
      H: typeof OriginalHelpers;
    }
  }
}

export { H };
