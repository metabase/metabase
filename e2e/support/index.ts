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

const wrappedHelpers = Object.entries(OriginalHelpers).reduce<
  Record<string, any>
>((acc, [key, helper]) => {
  acc[key] = function (...args: any[]) {
    return logGroup(
      cy,
      {
        name: key,
        displayName: `H.${key}`,
        message: formatArgs(args),
      },
      () => helper.apply(this, args),
    );
  };
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
