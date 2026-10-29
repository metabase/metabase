// Local replacement for the boolean-flag API of the deprecated `@cypress/skip-test` package.
// The matching `cy.skipOn` / `cy.onlyOn` commands are registered in e2e/support/commands/skip-test.ts.

const skipCurrentTest = () => {
  // cy.state is an internal API missing from the public Cypress types.
  // ctx.skip() is deliberately unguarded: a loud TypeError beats silently running a test meant to be skipped.
  const cyWithState = cy as unknown as {
    state: (key: "runnable") => { ctx: { skip: () => void } };
  };
  cyWithState.state("runnable").ctx.skip();
};

/**
 * With a callback, runs the callback (registering its tests) only when the flag is false.
 * Without one, skips the current test when the flag is true.
 */
export const skipOn = (flag: boolean, callback?: () => void): void => {
  if (typeof flag !== "boolean") {
    throw new Error("skipOn expects a boolean flag, for example skipOn(true)");
  }

  if (callback) {
    if (!flag) {
      callback();
    }
    return;
  }

  cy.log(`skipOn **${flag}**`);
  if (flag) {
    skipCurrentTest();
  }
};

/**
 * With a callback, runs the callback (registering its tests) only when the flag is true.
 * Without one, skips the current test unless the flag is true.
 */
export const onlyOn = (flag: boolean, callback?: () => void): void => {
  if (typeof flag !== "boolean") {
    throw new Error("onlyOn expects a boolean flag, for example onlyOn(true)");
  }

  if (callback) {
    if (flag) {
      callback();
    }
    return;
  }

  cy.log(`onlyOn **${flag}**`);
  if (!flag) {
    skipCurrentTest();
  }
};
