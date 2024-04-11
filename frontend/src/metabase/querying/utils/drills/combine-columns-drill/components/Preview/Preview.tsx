import { t } from "ttag";

import { Box, Card, Stack, Text } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

interface Props {
  preview: { color: string; value: RowValue }[];
}

export const Preview = ({ preview }: Props) => {
  if (preview.length === 0) {
    return null;
  }

  return (
    <Stack spacing="xs">
      <Text color="text-medium" lh={1} weight="bold">{t`Preview`}</Text>

      <Card bg="bg-light" py={12} radius="xs" shadow="none" withBorder>
        {preview.map(({ color, value }, index) => (
          <Box key={index}>
            <Text color={color} size="sm">
              {value}
            </Text>
          </Box>
        ))}
      </Card>
    </Stack>
  );
};
