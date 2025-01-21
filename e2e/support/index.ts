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
  acc[key] = (...args: any[]) => {
    return logGroup(
      cy,
      {
        name: key,
        displayName: `H.${key}`,
        message: formatArgs(args),
      },
      () => helper(...args),
    );
  };
  return acc;
}, {});

export const H = wrappedHelpers;
