import { type ChangeEvent, memo, useEffect, useState } from "react";
import { t } from "ttag";

import { CoercionStrategyPicker } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type {
  FieldChangeParams,
  MetadataEditMode,
} from "metabase/metadata/pages/DataModel/types";
import {
  canCoerceFieldType,
  getFieldRawName,
  getRawTableFieldId,
} from "metabase/metadata/utils/field";
import { Flex, Stack, Switch, rem } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { trackMetadataChange } from "../../../analytics";
import { TitledSection } from "../../TitledSection";

import S from "./DataSection.module.css";
import { LabeledValue } from "./LabeledValue";
import SubInputFollowIllustration from "./illustrations/sub-input-follow.svg?component";
import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface Props {
  mode: MetadataEditMode;
  field: Field;
  onFieldChange: (update: FieldChangeParams) => Promise<{ error?: string }>;
}

const DataSectionBase = ({ mode, field, onFieldChange }: Props) => {
  const fieldIdentity =
    mode === "table" ? { id: getRawTableFieldId(field) } : { name: field.name };
  const [isCasting, setIsCasting] = useState(
    field ? field.coercion_strategy != null : false,
  );
  const [autoFocusCoercionPicker, setAutoFocusCoercionPicker] = useState(false);
  const [isCoercionPickerOpen, setIsCoercionPickerOpen] = useState(false);
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  useEffect(() => {
    setIsCasting(field.coercion_strategy != null);
    setAutoFocusCoercionPicker(false);
  }, [field.coercion_strategy]);

  const disableCasting = async () => {
    const { error } = await onFieldChange({
      ...fieldIdentity,
      coercion_strategy: null,
    });

    if (error) {
      sendErrorToast(t`Failed to disable casting for ${field.display_name}`);
    } else {
      sendSuccessToast(
        t`Casting disabled for ${field.display_name}`,
        async () => {
          const { error } = await onFieldChange({
            ...fieldIdentity,
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
    const { error } = await onFieldChange({
      ...fieldIdentity,
      coercion_strategy: coercionStrategy,
    });

    if (error) {
      sendErrorToast(
        field.coercion_strategy == null
          ? t`Failed to enable casting for ${field.display_name}`
          : t`Failed to update casting for ${field.display_name}`,
      );
    } else {
      trackMetadataChange("type_casting");

      sendSuccessToast(
        field.coercion_strategy == null
          ? t`Casting enabled for ${field.display_name}`
          : t`Casting updated for ${field.display_name}`,
        async () => {
          const { error } = await onFieldChange({
            ...fieldIdentity,
            coercion_strategy: field.coercion_strategy,
          });
          sendUndoToast(error);
        },
      );
    }
  };

  return (
    <TitledSection title={t`Data`}>
      <LabeledValue label={t`Field name`}>
        {getFieldRawName(field)}
      </LabeledValue>

      <Stack gap={0}>
        <LabeledValue label={t`Data type`}>{field.database_type}</LabeledValue>

        {canCoerceFieldType(field) && mode === "table" && (
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
    </TitledSection>
  );
};

export const DataSection = memo(DataSectionBase);
