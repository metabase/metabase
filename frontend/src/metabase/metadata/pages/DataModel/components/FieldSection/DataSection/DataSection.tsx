import { memo, useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { CoercionStrategyPicker } from "metabase/metadata/components";
import {
  canCoerceFieldType,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Flex, Icon, Stack, Switch, TextInput, rem } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { SectionPill } from "../../SectionPill";

import S from "./DataSection.module.css";
import SubInputFollowIllustration from "./illustrations/sub-input-follow.svg?component";
import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface Props {
  field: Field;
}

const DataSectionBase = ({ field }: Props) => {
  const id = getRawTableFieldId(field);
  const [isCasting, setIsCasting] = useState(
    field ? field.coercion_strategy != null : false,
  );
  const [updateField] = useUpdateFieldMutation();
  const [sendToast] = useToast();

  useEffect(() => {
    setIsCasting(field.coercion_strategy != null);
  }, [field.coercion_strategy]);

  return (
    <Stack gap="md">
      <Box>
        <SectionPill title={t`Data`} />
      </Box>

      <TextInput
        classNames={{ input: S.disabledInput }}
        disabled
        label={t`Field name`}
        rightSection={<Icon className={S.disabledInputIcon} name="lock" />}
        rightSectionPointerEvents="none"
        value={field.name}
      />

      <Stack gap={0}>
        <TextInput
          classNames={{ input: S.disabledInput }}
          disabled
          label={t`Data type`}
          rightSection={<Icon className={S.disabledInputIcon} name="lock" />}
          rightSectionPointerEvents="none"
          value={field.database_type}
        />

        {canCoerceFieldType(field) && (
          <>
            <Flex gap="xs" ml={rem(12)}>
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

                  if (
                    !event.target.checked &&
                    field.coercion_strategy !== null
                  ) {
                    await updateField({ id, coercion_strategy: null });

                    sendToast({
                      icon: "check",
                      message: t`Casting disabled for ${field.display_name}`,
                    });
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

                  sendToast({
                    icon: "check",
                    message: t`Casting enabled for ${field.display_name}`,
                  });
                }}
              />
            )}
          </>
        )}
      </Stack>
    </Stack>
  );
};

export const DataSection = memo(DataSectionBase);
