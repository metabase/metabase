import type { ReactNode } from "react";

import { getFieldCurrency } from "metabase/metadata/utils/field";
import { Flex, type SelectProps, Stack, rem } from "metabase/ui";
import { isCurrency, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

import { CurrencyPicker } from "../CurrencyPicker";
import { FkTargetPicker } from "../FkTargetPicker";
import { SemanticTypePicker } from "../SemanticTypePicker";

import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface SemanticTypeAndTargetPickerProps {
  description?: string;
  field: Field;
  idFields: Field[];
  label?: string;
  selectProps?: Omit<SelectProps, "data" | "value" | "onChange">;
  semanticTypeError?: ReactNode;
  onChange: (
    patch: Partial<
      Pick<Field, "semantic_type" | "fk_target_field_id" | "settings">
    >,
  ) => void;
}

export const SemanticTypeAndTargetPicker = ({
  description,
  field,
  idFields,
  label,
  selectProps,
  semanticTypeError,
  onChange,
}: SemanticTypeAndTargetPickerProps) => {
  const showFKTargetSelect = isFK(field);
  const showCurrencyTypeSelect = isCurrency(field);

  const handleChangeSemanticType = (semanticType: string | null) => {
    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.fk_target_field_id != null && isFK(field)) {
      onChange({
        semantic_type: semanticType,
        fk_target_field_id: null,
      });
    } else {
      onChange({
        semantic_type: semanticType,
      });
    }
  };

  const handleChangeCurrency = (currency: string) => {
    onChange({
      settings: { ...field.settings, currency },
    });
  };

  const handleChangeTarget = (fieldId: FieldId | null) => {
    onChange({
      fk_target_field_id: fieldId,
    });
  };

  return (
    <Stack gap={0}>
      <SemanticTypePicker
        {...selectProps}
        description={description}
        error={semanticTypeError}
        field={field}
        label={label}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
      />

      {showCurrencyTypeSelect && (
        <>
          <Flex ml={rem(12)}>
            <SubInputIllustration />
          </Flex>

          <CurrencyPicker
            {...selectProps}
            value={getFieldCurrency(field.settings)}
            onChange={handleChangeCurrency}
          />
        </>
      )}

      {showFKTargetSelect && (
        <>
          <Flex ml={rem(12)}>
            <SubInputIllustration />
          </Flex>

          <FkTargetPicker
            {...selectProps}
            field={field}
            idFields={idFields}
            value={field.fk_target_field_id}
            onChange={handleChangeTarget}
          />
        </>
      )}
    </Stack>
  );
};
