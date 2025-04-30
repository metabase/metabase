import { useGetFieldQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { getFieldDisplayName } from "metabase/metadata/utils/field";
import { Box, Stack, Title } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { FieldDataSection } from "./FieldDataSection";
import S from "./FieldSection.module.css";

interface Props {
  fieldId: FieldId;
}

export const FieldSection = ({ fieldId }: Props) => {
  const { data: field, error, isLoading } = useGetFieldQuery({ id: fieldId });

  if (error || isLoading || !field) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

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
