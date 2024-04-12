import { t } from "ttag";

import { Card, ScrollArea, Stack, Text } from "metabase/ui";

import S from "./Preview.module.css";

interface Props {
  preview: string;
}

export const Preview = ({ preview }: Props) => {
  return (
    <Stack spacing="sm">
      <Text color="text-medium" lh={1} weight="bold">{t`Preview`}</Text>

      <Card
        bg="bg-light"
        className={S.scrollArea}
        component={ScrollArea}
        p="md"
        radius="xs"
        shadow="none"
        withBorder
      >
        <Text size="sm">{preview}</Text>
      </Card>
    </Stack>
  );
};
