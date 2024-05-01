import { t } from "ttag";

import { Card, ScrollArea, Stack, Text } from "metabase/ui";

interface Props {
  example: string;
}

export const Example = ({ example }: Props) => {
  return (
    <Stack spacing="sm">
      <Text color="text-medium" lh={1} weight="bold">{t`Example`}</Text>

      <Card
        bg="bg-light"
        component={ScrollArea}
        p="sm"
        radius="xs"
        shadow="none"
        withBorder
      >
        <Text
          size="sm"
          style={{ minHeight: "1rem" }}
          data-testid="combine-example"
          variant="monospace"
        >
          {example}
        </Text>
      </Card>
    </Stack>
  );
};
