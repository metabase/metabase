import { uuid } from "metabase/lib/uuid";

export class AttributeSerializer {
  // eslint-disable-next-line @typescript-eslint/ban-types
  static functionsMap: Record<string, Function> = {};

  static serializeAttributeValue(value: unknown): string {
    return JSON.stringify(value, (_, value) => {
      if (typeof value === "function") {
        const id = uuid();

        AttributeSerializer.functionsMap[id] = value;

        return id;
      }

      return value;
    });
  }

  static deserializeAttributeValue<TReturnValue>(value: string | undefined) {
    if (!value) {
      return undefined as unknown as TReturnValue;
    }

    return JSON.parse(value, (key, value) => {
      if (typeof AttributeSerializer.functionsMap[value] === "function") {
        return AttributeSerializer.functionsMap[value];
      }

      if (typeof window[value] === "function") {
        return window[value];
      }

      return value;
    }) as TReturnValue;
  }
}
