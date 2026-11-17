import cx from "classnames";
import { t } from "ttag";

import { Glossary } from "metabase/common/components/Glossary/Glossary";
import CS from "metabase/css/core/index.css";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import BaseSidebar from "metabase/reference/guide/BaseSidebar";
import { Group, Stack, Text } from "metabase/ui";

export function GlossaryContainer() {
  return (
    <SidebarLayout
      className={cx(CS.flexFull, CS.relative)}
      sidebar={<BaseSidebar />}
    >
      <Stack w="100%" h="100%">
        <Group
          align="center"
          wrap="nowrap"
          px="2.625rem"
          h="3rem"
          mt="2rem"
          justify="space-between"
        >
          <Text fw="bold" fz="1.5rem">{t`Glossary`}</Text>
        </Group>
        <Stack
          w="100%"
          gap={0}
          m={0}
          className={cx(CS.wrapper, CS.wrapperTrim)}
        >
          <Glossary />
        </Stack>
      </Stack>
    </SidebarLayout>
  );
}
