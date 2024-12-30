// H is for helpers 🤗
import * as OriginalHelpers from "./helpers";

const formatArgs = (args: any[]) => {
  try {
    return args.length > 0
      ? args
          .map(arg =>
            typeof arg === "object"
              ? JSON.stringify(arg, null, 2)
              : String(arg),
          )
          .join(", ")
      : "";
  } catch (e) {
    return "Unable to stringify args";
  }
};

// these helpers are not wrapped because they return modified mocha functions
const UNWRAPPED_HELPERS = [
  "describeEE",
  "describeWithSnowplow",
  "describeWithSnowplowEE",
];

const shouldWrapHelper = (key: string) => !UNWRAPPED_HELPERS.includes(key);

// Create wrapped versions of all helper functions
const wrappedHelpers = Object.entries(OriginalHelpers).reduce(
  (acc, [key, helper]) => {
    // not all helpers are functions, we need to check
    // @ts-expect-error helpers are not typed
    acc[key] =
      typeof helper === "function" && shouldWrapHelper(key)
        ? (...args: any[]) => {
            return cy.then(() => {
              const log = Cypress.log({
                name: `H.${key}`,
                message: formatArgs(args),
                // @ts-expect-error groupStart api is not public and typed
                groupStart: true,
                consoleProps: () => ({
                  Function: key,
                  Arguments: args,
                }),
              });

              const result = helper(...args);

              // If the result is a Cypress chain, attach the log end
              if (result && typeof result.then === "function") {
                return result.then((value: any) => {
                  // @ts-expect-error groupStart api is not public and typed
                  log.endGroup();
                  return value;
                });
              }

              // @ts-expect-error groupStart api is not public and typed
              log.endGroup();
              return result;
            });
          }
        : helper;

    return acc;
  },
  {} as typeof OriginalHelpers,
);

// Export the wrapped version but maintain the same usage pattern
export { wrappedHelpers as H };
