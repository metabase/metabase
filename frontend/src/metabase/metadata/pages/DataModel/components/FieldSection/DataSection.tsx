import { useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { CoercionStrategyPicker } from "metabase/metadata/components";
import {
  canCoerceFieldType,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Flex, Icon, Stack, Switch, TextInput } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { SectionPill } from "../SectionPill";

import SubInputFollowIllustration from "./illustrations/sub-input-follow.svg?component";
import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface Props {
  field: Field;
}

export const DataSection = ({ field }: Props) => {
  const [updateField] = useUpdateFieldMutation();
  const [isCasting, setIsCasting] = useState(
    field ? field.coercion_strategy != null : false,
  );
  const id = getRawTableFieldId(field);
  const [sendToast] = useToast();
  function confirm(message: string) {
    sendToast({ message, icon: "check" });
  }

  useEffect(() => {
    setIsCasting(field.coercion_strategy != null);
  }, [field.coercion_strategy]);

  return (
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

      <Stack gap={0}>
        <TextInput
          disabled
          label={t`Data type`}
          rightSection={<Icon name="lock" />}
          rightSectionPointerEvents="none"
          value={field.database_type}
        />

        {canCoerceFieldType(field) && (
          <>
            <Flex gap="xs" ml={12}>
              {isCasting ? (
                <SubInputFollowIllustration />
              ) : (
                <SubInputIllustration />
              )}

              <Switch
                checked={isCasting}
                flex="1"
                label={t`Cast to a specific data type`}
                mt="md"
                size="xs"
                onChange={async (event) => {
                  setIsCasting(event.target.checked);

                  if (!event.target.checked) {
                    await updateField({ id, coercion_strategy: null });
                    confirm(t`Casting disabled for ${field.display_name}`);
                  }
                }}
              />
            </Flex>

            {isCasting && (
              <CoercionStrategyPicker
                baseType={field.base_type}
                value={field.coercion_strategy ?? undefined}
                onChange={async (coercionStrategy) => {
                  await updateField({
                    id,
                    coercion_strategy: coercionStrategy,
                  });
                  confirm(t`Casting enabled for ${field.display_name}`);
                }}
              />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};
