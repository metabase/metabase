import type { MouseEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { Anchor, Popover, Stack, Text } from "metabase/ui";

export function MetabaseLinksToggleDescription() {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      key="popover"
      position="top-start"
      opened={opened}
      onClose={() => setOpened(false)}
    >
      <Popover.Target>
        <Anchor
          /**
           * This expands the vertical click area, so it's impossible to click above
           * or below the element and accidentally toggle the switch.
           */
          display="inline-block"
          style={{ userSelect: "none", cursor: "pointer" }}
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            setOpened(opened => !opened);
          }}
        >
          {t`Learn more`}
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack p="md" spacing="sm" maw={420}>
          <Text size="sm">
            {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
            {t`This affects all links in the product experience (outside of the admin panel) that point to Metabase.com URLs.`}
          </Text>
          <Text size="sm">
            {t`When hidden, your users will lose the ability to troubleshoot and learn how to use features such as the Query and SQL Editors, among others.`}
          </Text>
          <Text size="sm">
            {t`You might also want to customize the Application Name setting.`}
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
