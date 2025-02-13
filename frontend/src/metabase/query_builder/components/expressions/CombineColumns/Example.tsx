import { t } from "ttag";

import { Card, ScrollArea, Stack, Text } from "metabase/ui";

import type { ColumnAndSeparator } from "./util";
import { getExample } from "./util";

interface Props {
  columnsAndSeparators: ColumnAndSeparator[];
}

export const Example = ({ columnsAndSeparators }: Props) => {
  const example = getExample(columnsAndSeparators);

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
