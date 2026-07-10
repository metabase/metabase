export type GaugeRange = [number, number];

export const isGaugeRange = (value: unknown): value is GaugeRange => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
};
