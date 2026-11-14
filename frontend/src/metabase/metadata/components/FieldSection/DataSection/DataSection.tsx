import { memo } from "react";
import { t } from "ttag";

import { useFieldCasting } from "metabase/metadata/hooks";
import type { MetadataEditEventDetail } from "metabase/metadata/pages/shared/analytics";
import {
  canCoerceFieldType,
  getFieldRawName,
} from "metabase/metadata/utils/field";
import { Box, Flex, Stack, Switch, rem } from "metabase/ui";
import type { Field } from "metabase-types/api";

import { CoercionStrategyPicker } from "../../CoercionStrategyPicker";
import { LabeledValue } from "../../LabeledValue";
import { TitledSection } from "../../TitledSection";

import S from "./DataSection.module.css";
import SubInputFollowIllustration from "./illustrations/sub-input-follow.svg?component";
import SubInputIllustration from "./illustrations/sub-input.svg?component";

type DataSectionBaseProps = {
  field: Field;
  disabled?: boolean;
  onTrackMetadataChange: (detail: MetadataEditEventDetail) => void;
};

const DataSectionBase = ({
  field,
  disabled,
  onTrackMetadataChange,
}: DataSectionBaseProps) => {
  const {
    isCasting,
    autoFocusCoercionPicker,
    isCoercionPickerOpen,
    setIsCoercionPickerOpen,
    handleCastingChange,
    handleCoercionStrategyChange,
  } = useFieldCasting({ field, onTrackMetadataChange });

  return (
    <TitledSection>
      <Stack align="start">
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
              <Flex gap="xxs" ml={rem(12)} wrap="nowrap">
                {isCasting ? (
                  <SubInputFollowIllustration />
                ) : (
                  <SubInputIllustration />
                )}

                <Stack>
                  <Switch
                    checked={isCasting}
                    disabled={disabled}
                    classNames={{
                      body: S.switchBody,
                    }}
                    flex="1"
                    label={t`Cast to a specific data type`}
                    mt="lg"
                    onChange={handleCastingChange}
                  />
                  {isCasting && (
                    <CoercionStrategyPicker
                      autoFocus={autoFocusCoercionPicker}
                      baseType={field.base_type}
                      disabled={disabled}
                      dropdownOpened={isCoercionPickerOpen}
                      value={field.coercion_strategy ?? undefined}
                      onChange={handleCoercionStrategyChange}
                      onDropdownClose={() => setIsCoercionPickerOpen(false)}
                      onDropdownOpen={() => setIsCoercionPickerOpen(true)}
                    />
                  )}
                </Stack>
              </Flex>
            </>
          )}
        </Stack>
      </Stack>
    </TitledSection>
  );
};

export const DataSection = memo(DataSectionBase);
