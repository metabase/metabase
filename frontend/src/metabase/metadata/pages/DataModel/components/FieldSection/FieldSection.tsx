import { Box, Title } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId?: FieldId;
}

export const FieldSection = ({ fieldId }: Props) => {
  return (
    <Box>
      <Title mb="md" order={2}>
        Category
      </Title>

      <Box>Field: {fieldId}</Box>
    </Box>
  );
};
