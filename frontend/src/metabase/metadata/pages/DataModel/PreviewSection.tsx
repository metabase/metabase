import { Box, Card, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId?: FieldId;
}

export const PreviewSection = ({ fieldId }: Props) => {
  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">Field preview</Text>
      <Box>Field: {fieldId}</Box>
    </Card>
  );
};
