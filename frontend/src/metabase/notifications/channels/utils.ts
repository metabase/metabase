import type { SlackChannelId, SlackChannelOption } from "metabase-types/api";

export function getDisplayNames(options: SlackChannelOption[]): string[] {
  return options.map((o) => o.displayName);
}

export function findChannelId(
  options: SlackChannelOption[],
  displayName: string,
): SlackChannelId | undefined {
  return options.find((o) => o.displayName === displayName)?.id;
}
