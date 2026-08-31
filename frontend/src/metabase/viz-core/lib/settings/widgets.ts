const PREFIX = "\0_";

// Encode boolean/null values to strings for Mantine form widgets (Select, Radio, etc), , needed for settings like "graph.x_axis.axis_enabled"
const toWidgetValue = new Map<unknown, string>([
  [true, `${PREFIX}true`],
  [false, `${PREFIX}false`],
  [null, `${PREFIX}null`],
]);

const fromWidgetValue = new Map<string, unknown>(
  Array.from(toWidgetValue.entries()).map(([key, value]) => [value, key]),
);

export const encodeWidgetValue = (value: unknown): string => {
  const mapped = toWidgetValue.get(value);
  return mapped ?? String(value);
};

export const decodeWidgetValue = (value: string): unknown => {
  const decoded = fromWidgetValue.get(value);
  return decoded !== undefined ? decoded : value;
};
