import cx from "classnames";

import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFormattingSettings, FieldId } from "metabase-types/api";

import FieldSeparator from "../FieldSeparator";

import { CurrencyPicker } from "./CurrencyPicker";
import { FkTargetPicker } from "./FkTargetPicker";
import { SemanticTypePicker } from "./SemanticTypePicker";

interface SemanticTypeAndTargetPickerProps {
  className?: string;
  field: Field;
  idFields: Field[];
  hasSeparator?: boolean;
  onUpdateField: (field: Field, updates: Partial<Field>) => void;
}

const SemanticTypeAndTargetPicker = ({
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
    <div
      data-testid="semantic-type-target-picker"
      className={hasSeparator ? cx(CS.flex, CS.alignCenter) : undefined}
    >
      <SemanticTypePicker
        baseType={field.base_type}
        className={className}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
      />

      {showCurrencyTypeSelect && hasSeparator && <FieldSeparator />}

      {showCurrencyTypeSelect && (
        <CurrencyPicker
          className={cx(
            AdminS.TableEditorFieldTarget,
            hasSeparator ? CS.mt0 : CS.mt1,
            className,
          )}
          value={getFieldCurrency(field)}
          onChange={handleChangeCurrency}
        />
      )}

      {showFKTargetSelect && hasSeparator && <FieldSeparator />}

      {showFKTargetSelect && (
        <FkTargetPicker
          className={cx(
            AdminS.TableEditorFieldTarget,
            CS.textWrap,
            hasSeparator ? CS.mt0 : CS.mt1,
            className,
          )}
          field={field}
          idFields={idFields}
          value={field.fk_target_field_id}
          onChange={handleChangeTarget}
        />
      )}
    </div>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SemanticTypeAndTargetPicker;
