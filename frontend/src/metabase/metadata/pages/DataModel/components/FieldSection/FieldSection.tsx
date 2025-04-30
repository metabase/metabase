import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetFieldQuery, useUpdateFieldMutation } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { Box, Icon, Stack, Switch, TextInput, Title } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

import S from "./FieldSection.module.css";

interface Props {
  fieldId: FieldId;
}

export const FieldSection = ({ fieldId }: Props) => {
  const { data: field, error, isLoading } = useGetFieldQuery({ id: fieldId });
  const [updateField] = useUpdateFieldMutation();
  const [isCasting, setIsCasting] = useState(
    field ? field.coercion_strategy != null : false,
  );

  useEffect(() => {
    if (field) {
      setIsCasting(field.coercion_strategy != null);
    }
  }, [field]);

  if (error || isLoading || !field) {
    return <LoadingAndErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Stack gap={0} h="100%">
      <Title order={2} px="xl" py="lg" pb="md">
        {field.display_name || field.name || NULL_DISPLAY_VALUE}
      </Title>

      <Box className={S.container} h="100%" pb="lg" px="xl">
        <Stack gap="md">
          <Box>
            <SectionPill icon="database" title={t`Data`} />
          </Box>

          <TextInput
            disabled
            label={t`Field name`}
            rightSection={<Icon name="lock" />}
            rightSectionPointerEvents="none"
            value={field.name}
          />

          <TextInput
            disabled
            label={t`Data type`}
            rightSection={<Icon name="lock" />}
            rightSectionPointerEvents="none"
            value={field.database_type}
          />

          <Switch
            checked={isCasting}
            label={t`Cast to a specific data type`}
            size="xs"
            onChange={(event) => {
              setIsCasting(event.target.checked);

              if (!event.target.checked) {
                updateField({ id: fieldId, coercion_strategy: null });
              }
            }}
          />
        </Stack>
      </Box>
    </Stack>
  );
};
