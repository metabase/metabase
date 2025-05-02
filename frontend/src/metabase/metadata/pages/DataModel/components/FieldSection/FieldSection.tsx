import { getFieldDisplayName } from "metabase/metadata/utils/field";
import { Box, Stack, Title } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { FieldDataSection } from "./FieldDataSection";
import S from "./FieldSection.module.css";

interface Props {
  field: Field;
}

export const FieldSection = ({ field }: Props) => {
  return (
    <Stack gap={0} h="100%">
      <Title order={2} px="xl" py="lg" pb="md">
        {getFieldDisplayName(field)}
      </Title>

      <Box className={S.container} h="100%" pb="lg" px="xl">
        <FieldDataSection field={field} />
      </Box>
    </Stack>
  );
};
