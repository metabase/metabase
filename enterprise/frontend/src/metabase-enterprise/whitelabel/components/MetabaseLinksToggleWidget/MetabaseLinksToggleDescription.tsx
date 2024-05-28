import { t, jt } from "ttag";

import { Anchor, Popover, Stack, Text } from "metabase/ui";

export function MetabaseLinksToggleDescription() {
  // eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */
  return jt`Control the visibility of links to Metabase documentation and Metabase references in your instance. ${(
    <Popover key="popover" position="top-start">
      <Popover.Target>
        <Anchor style={{ userSelect: "none", cursor: "pointer" }}>
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
  )}`;
}
