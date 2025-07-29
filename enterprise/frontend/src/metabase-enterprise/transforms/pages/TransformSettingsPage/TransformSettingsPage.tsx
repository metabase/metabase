import { t } from "ttag";

import { Card, Flex, Stack, Title } from "metabase/ui";

import S from "./TransformSettingsPage.module.css";

export function TransformSettingsPage() {
  return (
    <Flex
      className={S.root}
      w="100%"
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
          </Stack>
        </Card>
      </Stack>
    </Flex>
  );
}
