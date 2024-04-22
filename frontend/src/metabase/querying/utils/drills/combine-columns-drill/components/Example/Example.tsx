import { t } from "ttag";

import { Card, ScrollArea, Stack, Text } from "metabase/ui";

import S from "./Example.module.css";

interface Props {
  example: string;
}

export const Example = ({ example }: Props) => {
  return (
    <Stack spacing="sm">
      <Text color="text-medium" lh={1} weight="bold">{t`Example`}</Text>

      <Card
        bg="bg-light"
        className={S.scrollArea}
        component={ScrollArea}
        p="sm"
        radius="xs"
        shadow="none"
        withBorder
      >
        <Text
          size="sm"
          data-testid="combine-column-example"
          variant="monospace"
        >
          {example}
        </Text>
      </Card>
    </Stack>
  );
};
