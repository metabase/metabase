import _ from "underscore";

export class OnWrapper {
  private readonly listeners: Record<
    string,
    Array<(...args: any[]) => Promise<any> | any>
  > = {};

  private readonly originalOn: Cypress.PluginEvents;

  constructor(on: Cypress.PluginEvents) {
    this.originalOn = on;
  }

  public on = (
    event: string,
    handler: (...args: any[]) => Promise<any> | any,
  ): number | void => {
    if (event === "task") {
      return this.originalOn(
        "task",
        handler as unknown as Parameters<Cypress.PluginEvents>[1],
      );
    }

    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    return this.listeners[event].push(handler);
  };

  public forward = (): void => {
    Object.entries(this.listeners).forEach(([event, handlers]) => {
      this.originalOn(event as any, async (...args: any[]) => {
        let result: any = {};

        for (const handler of handlers) {
          const res = await handler(...args);

          if (_.isObject(res)) {
            _.assign(result, res);
          } else {
            result = res;
          }
        }

        return result;
      });
    });
  };
}
