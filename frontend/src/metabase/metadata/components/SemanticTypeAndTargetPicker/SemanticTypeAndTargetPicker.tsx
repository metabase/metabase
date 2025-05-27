import { Box, Flex, Icon } from "metabase/ui";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFormattingSettings, FieldId } from "metabase-types/api";

import { CurrencyPicker } from "../CurrencyPicker";
import { FkTargetPicker } from "../FkTargetPicker";
import { SemanticTypePicker } from "../SemanticTypePicker";

interface SemanticTypeAndTargetPickerProps {
  className?: string;
  field: Field;
  idFields: Field[];
  hasSeparator?: boolean;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

export const SemanticTypeAndTargetPicker = ({
  className,
  field,
  idFields,
  hasSeparator,
  onUpdateField,
}: SemanticTypeAndTargetPickerProps) => {
  const showFKTargetSelect = field.isFK();
  const showCurrencyTypeSelect = field.isCurrency();

  const handleChangeSemanticType = (semanticType: string | null) => {
    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && field.isFK()) {
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
        className={className}
        field={field.getPlainObject()}
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
          className={className}
          field={field.getPlainObject()}
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

  const settings = getGlobalSettingsForColumn(field) as FieldFormattingSettings;
  if (settings.currency) {
    return settings.currency;
  }

  return "USD";
};
