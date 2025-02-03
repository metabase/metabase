/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Log {
      endGroup: () => void;
    }

    interface LogConfig {
      groupStart?: boolean;
    }

    interface Cypress {
      Command: {
        create: (options: CommandOptions) => any;
      };
    }
  }
}

interface CommandOptions extends Cypress.CommandOptions {
  name: string;
  type: "parent" | "child";
  args: any[];
  fn: () => any;
  chainerId?: string;
  logs?: Cypress.Log[];
}

export interface LogGroupConfig {
  name?: string;
  displayName?: string;
  message?: string | string[];
}

type LogCallback = (log: Cypress.Log) => unknown;

export const logGroup = (
  cy: any,
  userOptions: LogGroupConfig,
  fn: LogCallback,
) => {
  const log = Cypress.log({
    name: userOptions.name || "",
    displayName: userOptions.displayName || "",
    message: Array.isArray(userOptions.message)
      ? userOptions.message
      : [userOptions.message || ""],
    type: "parent",
    autoEnd: false,
    groupStart: true,
  });

  // Track command additions
  const onCommand = (command: any) => {
    if (command.get("logs")) {
      command.get("logs").forEach((cmdLog: Cypress.Log) => {
        // @ts-expect-error - Cypress internal API for grouping logs
        log.set("group", cmdLog);
      });
    }
  };

  cy.on("command:start", onCommand);

  // Execute the function
  const result = fn(log);

  // Clean up the listener and end the group
  cy.then(() => {
    cy.removeListener("command:start", onCommand);
    log.endGroup();
  });

  return result;
};
