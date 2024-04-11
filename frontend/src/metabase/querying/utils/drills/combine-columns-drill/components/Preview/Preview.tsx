import { t } from "ttag";

import { SmallGenericError } from "metabase/components/ErrorPages";
import { Box, Card, ScrollArea, Stack, Text } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import S from "./Preview.module.css";

interface Props {
  error?: unknown;
  preview: { color: string; value: RowValue }[];
}

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error) {
    return undefined;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }

  return t`Unable to generate preview`;
};

export const Preview = ({ error, preview }: Props) => {
  if (preview.length === 0 && !error) {
    return null;
  }

  return (
    <Stack spacing="sm">
      <Text color="text-medium" lh={1} weight="bold">{t`Preview`}</Text>

      {error && <SmallGenericError message={getErrorMessage(error)} />}

      {!error && (
        <Card bg="bg-light" p={0} radius="xs" shadow="none" withBorder>
          <ScrollArea className={S.scrollArea} p="md">
            {preview.map(({ color, value }, index) => (
              <Box key={index}>
                <Text color={color} size="sm">
                  {value}
                </Text>
              </Box>
            ))}
          </ScrollArea>
        </Card>
      )}
    </Stack>
  );
};
