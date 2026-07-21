import { msgid, ngettext } from "ttag";

import { HoverCard, Stack, Text } from "metabase/ui";

type Props = {
  /** External origins the app may fetch/XHR (from `data_app.yaml`). */
  hosts: string[];
};

/**
 * The app's network allowlist, shown inline in the admin list as an underlined
 * "N allowed hosts" that reveals the origins in a hover card. Renders nothing
 * when the app declares no allowed hosts.
 */
export function DataAppAllowedHosts({ hosts }: Props) {
  if (hosts.length === 0) {
    return null;
  }

  const label = ngettext(
    msgid`${hosts.length} allowed host`,
    `${hosts.length} allowed hosts`,
    hosts.length,
  );

  return (
    <HoverCard position="bottom-start">
      <HoverCard.Target>
        <Text
          size="sm"
          c="text-secondary"
          lh="1.4"
          style={{ textDecoration: "underline dotted", cursor: "help" }}
        >
          {label}
        </Text>
      </HoverCard.Target>
      <HoverCard.Dropdown p="sm">
        <Stack gap="xs">
          {hosts.map((host, index) => (
            <Text key={`${index}-${host}`} ff="monospace" size="sm">
              {host}
            </Text>
          ))}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
