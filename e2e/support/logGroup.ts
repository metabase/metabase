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
  const cmd = Cypress.Command.create({
    name: userOptions.name || "",
    type: "parent",
    args: Array.isArray(userOptions.message)
      ? userOptions.message
      : [userOptions.message || ""],
    fn: () => {
      const log = Cypress.log({
        name: userOptions.name || "",
        displayName: userOptions.displayName || "",
        message: Array.isArray(userOptions.message)
          ? userOptions.message
          : [userOptions.message || ""],
        type: "parent",
        autoEnd: true,
        groupStart: true,
      });

      cmd.log(log);

      try {
        const result = fn(log) as any;

        if (result?.then) {
          return result.then((value: any) => {
            log.endGroup();
            return value;
          });
        }

        if (!result) {
          return cy.wrap(true, { log: false }).then(() => {
            log.endGroup();
          });
        }

        log.endGroup();
        return result;
      } catch (e) {
        log.endGroup();
        throw e;
      }
    },
  } as CommandOptions);

  return cy.wrap(null, { log: false }).then(() => {
    cy.queue.insert(cy.queue.index + 1, cmd);
    return cmd;
  });
};
