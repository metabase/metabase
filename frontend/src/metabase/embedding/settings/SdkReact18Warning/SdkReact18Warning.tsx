import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Group, Icon, ScrollArea, Stack, Text } from "metabase/ui";
import type { SdkReact18Host } from "metabase-types/api";

export const useSdkReact18DocsUrl = () =>
  useDocsUrl("embedding/sdk/introduction", {
    anchor: "modular-embedding-sdk-prerequisites",
  });

interface SdkReact18WarningBodyProps {
  hosts: SdkReact18Host[];
}

export function SdkReact18WarningBody({ hosts }: SdkReact18WarningBodyProps) {
  return (
    <>
      <Text lh="1.5rem">
        {t`Metabase 66 removes support for React 18. Before upgrading to Metabase 66, update these apps to React 19:`}
      </Text>
      <ScrollArea.Autosize mah="10rem">
        <Stack gap="xs" component="ul" m={0} p={0}>
          {hosts.map(({ id, host }) => (
            <Group key={id} component="li" gap="sm" wrap="nowrap">
              <Icon name="globe" c="text-secondary" aria-hidden />
              <Text lh="1.5rem">{host ?? t`Unknown host app`}</Text>
            </Group>
          ))}
        </Stack>
      </ScrollArea.Autosize>
    </>
  );
}
