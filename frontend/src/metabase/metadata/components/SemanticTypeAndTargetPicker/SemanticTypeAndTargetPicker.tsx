import { Box, Flex, Icon, type SelectProps } from "metabase/ui";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { isCurrency, isFK } from "metabase-lib/v1/types/utils/isa";
import type {
  Field,
  FieldFormattingSettings,
  FieldId,
} from "metabase-types/api";

import { CurrencyPicker } from "../CurrencyPicker";
import { FkTargetPicker } from "../FkTargetPicker";
import { SemanticTypePicker } from "../SemanticTypePicker";

interface SemanticTypeAndTargetPickerProps {
  className?: string;
  description?: string;
  field: Field;
  hasSeparator?: boolean;
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
  hasSeparator,
  selectProps,
  onUpdateField,
}: SemanticTypeAndTargetPickerProps) => {
  const showFKTargetSelect = isFK(field);
  const showCurrencyTypeSelect = isCurrency(field);

  const handleChangeSemanticType = (semanticType: string | null) => {
    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && isFK(field)) {
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
    <Flex
      align="center"
      data-testid="semantic-type-target-picker"
      display={hasSeparator ? "flex" : "block"}
    >
      <SemanticTypePicker
        {...selectProps}
        className={className}
        description={description}
        field={field}
        label={label}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
      />

      {showCurrencyTypeSelect && hasSeparator && (
        <Box color="text-medium" px="md">
          <Icon name="chevronright" size={12} />
        </Box>
      )}

      {showCurrencyTypeSelect && (
        <CurrencyPicker
          {...selectProps}
          className={className}
          mt={hasSeparator ? 0 : "xs"}
          value={getFieldCurrency(field)}
          onChange={handleChangeCurrency}
        />
      )}

      {showFKTargetSelect && hasSeparator && (
        <Box color="text-medium" px="md">
          <Icon name="chevronright" size={12} />
        </Box>
      )}

      {showFKTargetSelect && (
        <FkTargetPicker
          {...selectProps}
          className={className}
          field={field}
          idFields={idFields}
          mt={hasSeparator ? 0 : "xs"}
          value={field.fk_target_field_id}
          onChange={handleChangeTarget}
        />
      )}
    </Flex>
  );
};

const getFieldCurrency = (field: Field) => {
  if (field.settings?.currency) {
    return field.settings.currency;
  }

  const settings: FieldFormattingSettings = getGlobalSettingsForColumn(field);

  if (settings.currency) {
    return settings.currency;
  }

  return "USD";
};
