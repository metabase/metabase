import { t } from "ttag";

import { Card, Flex, Select, Stack, Title } from "metabase/ui";

import S from "./TransformSettingsPage.module.css";

export function TransformSettingsPage() {
  return (
    <Flex
      className={S.root}
      flex={1}
      h="100%"
      direction="column"
      align="center"
      p="xl"
    >
      <Stack w="100%" maw="40rem" gap="xl">
        <Title order={1}>{t`Transforms settings`}</Title>
        <Card p="lg">
          <Stack gap="lg">
            <Title order={4}>{t`Schedule`}</Title>
            <Select label={t`How often should transforms run?`} data={[]} />
          </Stack>
        </Card>
      </Stack>
    </Flex>
  );
}
