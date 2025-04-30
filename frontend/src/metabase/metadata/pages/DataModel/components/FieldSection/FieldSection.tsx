import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { Box, Stack, Title } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

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
        {field.display_name || field.name || NULL_DISPLAY_VALUE}
      </Title>

      <Box className={S.container} h="100%" pb="lg" px="xl">
        <SectionPill icon="database" title={t`Data`} />
      </Box>
    </Stack>
  );
};
