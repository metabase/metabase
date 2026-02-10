import json5 from "json5";

// Convert kebab-case attribute names to their camelCase setting keys.
export const attributeToSettingKey = (attr: string): string =>
  attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Naïve parsing of attribute values -> appropriate JS types (number, boolean, string)
export const parseAttributeValue = (value: string | null): unknown => {
  if (value === "[object Object]") {
    console.error(
      "You are passing an object to `setAttribute`, this is not supported as the browser will call `.toString()` to it, making it `[object Object]`.\nPlease pass a string or set the property directly, eg embed.theme = {...}",
    );
  }
  if (value === null) {
    return undefined;
  }

  // Boolean attributes:
  if (value === "" || value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  // Numeric attributes (e.g. ids)
  const num = Number(value);
  // Preserve leading zeros etc. by ensuring value is numeric and not NaN
  if (!Number.isNaN(num) && /^\d+(\.\d+)?$/.test(value)) {
    return num;
  }

  // Attempt to parse JSON arrays/objects for complex attributes
  if (value.startsWith("[") || value.startsWith("{")) {
    try {
      return json5.parse(value);
    } catch (e) {
      console.error(
        "Error while trying to parse an attribute. Received:",
        value,
        "Caught error:",
        e,
      );
    }
  }

  return value;
};
