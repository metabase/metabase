export function isDef<T>(value: T | undefined | null): value is T {
  return value !== null && value !== undefined;
}
