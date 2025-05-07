import { type MouseEvent, useState } from "react";
import { t } from "ttag";

import { Anchor, Popover, Stack, Text } from "metabase/ui";

export function MetabaseLinksToggleDescription() {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      key="popover"
      position="top-start"
      opened={opened}
      onChange={() => setOpened(!opened)}
    >
      <Popover.Target>
        <Anchor
          style={{ cursor: "pointer" }}
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            setOpened((opened) => !opened);
          }}
        >
          {t`Learn more`}
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack p="md" gap="sm" maw="26rem">
          <Text size="sm">
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
