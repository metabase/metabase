import { getFieldCurrency } from "metabase/metadata/utils/field";
import { Flex, type SelectProps, Stack, rem } from "metabase/ui";
import { isCurrency, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId } from "metabase-types/api";

import { CurrencyPicker } from "../CurrencyPicker";
import { FkTargetPicker } from "../FkTargetPicker";
import { SemanticTypePicker } from "../SemanticTypePicker";

import SubInputIllustration from "./illustrations/sub-input.svg?component";

interface SemanticTypeAndTargetPickerProps {
  className?: string;
  description?: string;
  field: Field;
  idFields: Field[];
  label?: string;
  selectProps?: Omit<SelectProps, "data" | "value" | "onChange">;
  onUpdateField: (
    field: Field,
    updates: Partial<
      Pick<Field, "semantic_type" | "fk_target_field_id" | "settings">
    >,
  ) => void;
}

export const SemanticTypeAndTargetPicker = ({
  className,
  description,
  field,
  idFields,
  label,
  selectProps,
  onUpdateField,
}: SemanticTypeAndTargetPickerProps) => {
  const showFKTargetSelect = isFK(field);
  const showCurrencyTypeSelect = isCurrency(field);

  const handleChangeSemanticType = (semanticType: string | null) => {
    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.fk_target_field_id != null && isFK(field)) {
      onUpdateField(field, {
        semantic_type: semanticType,
        fk_target_field_id: null,
      });
    } else {
      onUpdateField(field, {
        semantic_type: semanticType,
      });
    }
  };

  const handleChangeCurrency = (currency: string) => {
    onUpdateField(field, {
      settings: { ...field.settings, currency },
    });
  };

  const handleChangeTarget = (fieldId: FieldId | null) => {
    onUpdateField(field, {
      fk_target_field_id: fieldId,
    });
  };

  return (
    <Stack gap={0}>
      <SemanticTypePicker
        {...selectProps}
        className={className}
        description={description}
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
            className={className}
            value={getFieldCurrency(field)}
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
            className={className}
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
