type userOptions = {
  name: string;
  displayName: string;
  message: string | string[];
};

export const logGroup = (
  cy: Cypress.Chainable,
  userOptions: userOptions,
  fn: any,
) => {
  cy.then(() => {
    Cypress.log({
      name: userOptions.name || "",
      displayName: userOptions.displayName || "",
      message: Array.isArray(userOptions.message)
        ? userOptions.message
        : [userOptions.message || ""],
      type: "parent",
      // @ts-expect-error - groupStart is not typed by Cypress
      groupStart: true,
      consoleProps() {
        return {
          name: userOptions.name || "",
          displayName: userOptions.displayName || "",
          message: Array.isArray(userOptions.message)
            ? userOptions.message
            : [userOptions.message || ""],
        };
      },
    });
  });

  // Handle both function calls and object method calls
  let result;
  if (typeof fn === "function") {
    result = fn();
  } else if (fn && typeof fn === "object") {
    // For object methods like NativeEditor.get(), preserve the object context
    result = Object.getPrototypeOf(fn).constructor.prototype.apply.call(fn);
  } else {
    result = fn;
  }

  // If the result is not a chainable (doesn't have .then), wrap it in a command
  if (!result || typeof result.then !== "function") {
    return cy.then(() => {
      // @ts-expect-error - queue is not typed by Cypress
      const restoreCmdIndex = cy.queue.index + 1;

      // @ts-expect-error - Command is not typed by Cypress
      const endLogGroupCmd = Cypress.Command.create({
        name: "end-logGroup",
        injected: true,
        args: [],
      });

      const forwardYieldedSubject = () => {
        // @ts-expect-error - endGroup is not typed by Cypress
        Cypress.log({}).endGroup();
        return result;
      };

      // @ts-expect-error - queue is not typed by Cypress
      cy.queue.insert(
        restoreCmdIndex,
        endLogGroupCmd.set("fn", forwardYieldedSubject),
      );
      return result;
    });
  }

  // For chainable results, use the original .then approach
  return result.then((chainedResult: any) => {
    // @ts-expect-error - endGroup is not typed by Cypress
    Cypress.log({}).endGroup();
    return chainedResult;
  });
};
