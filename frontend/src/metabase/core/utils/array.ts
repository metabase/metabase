export const isNotNull = <TValue>(
  value: TValue | null | undefined,
): value is TValue => value != null;
