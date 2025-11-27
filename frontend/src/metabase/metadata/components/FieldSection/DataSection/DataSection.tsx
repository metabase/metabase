import { type ChangeEvent, memo, useEffect, useState } from "react";
import { t } from "ttag";

import { useUpdateFieldMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  canCoerceFieldType,
  getFieldRawName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Box, Flex, Group, Stack, Switch, rem } from "metabase/ui";
import type { MetadataEditEventDetail } from "metabase-types/analytics";
import type { Field } from "metabase-types/api";

import { CoercionStrategyPicker } from "../../CoercionStrategyPicker";
import { LabeledValue } from "../../LabeledValue";
import { TitledSection } from "../../TitledSection";

import S from "./DataSection.module.css";
import SubInputFollowIllustration from "./illustrations/sub-input-follow.svg?component";
import SubInputIllustration from "./illustrations/sub-input.svg?component";

type DataSectionBaseProps = {
  field: Field;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

const DataSectionBase = ({
  field,
  onTrackMetadataChange,
}: DataSectionBaseProps) => {
  const id = getRawTableFieldId(field);
  const [isCasting, setIsCasting] = useState(
    field ? field.coercion_strategy != null : false,
  );
  const [autoFocusCoercionPicker, setAutoFocusCoercionPicker] = useState(false);
  const [isCoercionPickerOpen, setIsCoercionPickerOpen] = useState(false);
  const [updateField] = useUpdateFieldMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  useEffect(() => {
    setIsCasting(field.coercion_strategy != null);
    setAutoFocusCoercionPicker(false);
  }, [field.coercion_strategy]);

  const disableCasting = async () => {
    const { error } = await updateField({
      id,
      coercion_strategy: null,
    });

    if (error) {
      sendErrorToast(t`Failed to disable casting for ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Casting disabled for ${field.display_name}`,
        async () => {
          const { error } = await updateField({
            id,
            coercion_strategy: field.coercion_strategy,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  const handleCastingChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setIsCasting(event.target.checked);
    setAutoFocusCoercionPicker(event.target.checked);

    if (event.target.checked) {
      setIsCoercionPickerOpen(true);
    } else if (field.coercion_strategy != null) {
      await disableCasting();
    }
  };

  const handleCoercionStrategyChange = async (
    coercionStrategy: string | null,
  ) => {
    const { error } = await updateField({
      id,
      coercion_strategy: coercionStrategy,
    });

    if (error) {
      sendErrorToast(
        field.coercion_strategy == null
          ? t`Failed to enable casting for ${field.display_name}`
          : t`Failed to update casting for ${field.display_name}`,
      );
    } else {
      onTrackMetadataChange("type_casting");

      sendSuccessToast(
        field.coercion_strategy == null
          ? t`Casting enabled for ${field.display_name}`
          : t`Casting updated for ${field.display_name}`,
        async () => {
          const { error } = await updateField({
            id,
            coercion_strategy: field.coercion_strategy,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return (
    <TitledSection>
      <Group align="start">
        <Box flex={1}>
          <LabeledValue label={t`Field name`}>
            {getFieldRawName(field)}
          </LabeledValue>
        </Box>
        <Stack gap={0} flex={1}>
          <LabeledValue label={t`Data type`}>
            {field.database_type}
          </LabeledValue>

          {canCoerceFieldType(field) && (
            <>
              <Flex gap="xs" ml={rem(12)} wrap="nowrap">
                {isCasting ? (
                  <SubInputFollowIllustration />
                ) : (
                  <SubInputIllustration />
                )}

                <Switch
                  checked={isCasting}
                  classNames={{
                    body: S.switchBody,
                  }}
                  flex="1"
                  label={t`Cast to a specific data type`}
                  mt="md"
                  size="xs"
                  onChange={handleCastingChange}
                />
              </Flex>

              {isCasting && (
                <CoercionStrategyPicker
                  autoFocus={autoFocusCoercionPicker}
                  baseType={field.base_type}
                  dropdownOpened={isCoercionPickerOpen}
                  value={field.coercion_strategy ?? undefined}
                  onChange={handleCoercionStrategyChange}
                  onDropdownClose={() => setIsCoercionPickerOpen(false)}
                  onDropdownOpen={() => setIsCoercionPickerOpen(true)}
                />
              )}
            </>
          )}
        </Stack>
      </Group>
    </TitledSection>
  );
};

export const DataSection = memo(DataSectionBase);
