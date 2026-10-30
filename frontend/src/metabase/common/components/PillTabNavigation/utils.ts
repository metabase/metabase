import type { TabCountState } from "./TabCountBadge";

export function getTabCount({
  value,
  isError,
}: {
  value: number | undefined;
  isError: boolean;
}): TabCountState {
  if (isError) {
    return { status: "error" };
  }
  if (value !== undefined) {
    return { status: "loaded", value };
  }
  return { status: "loading" };
}
