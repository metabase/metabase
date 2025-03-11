import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import type { SelectChangeEvent } from "metabase/core/components/Select";
import LegacySelect from "metabase/core/components/Select";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFormattingSettings, FieldId } from "metabase-types/api";

import FieldSeparator from "../FieldSeparator";

import { CurrencyPicker } from "./CurrencyPicker";
import { SemanticTypePicker } from "./SemanticTypePicker";

const SEARCH_PROPS = [
  "display_name",
  "table.display_name",
  "table.schema_name",
];

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
  const comparableIdFields = idFields.filter((idField: Field) =>
    field.isComparableWith(idField),
  );
  const hasIdFields = comparableIdFields.length > 0;
  const includeSchema = hasMultipleSchemas(comparableIdFields);
  const showFKTargetSelect = field.isFK();
  const showCurrencyTypeSelect = field.isCurrency();

  const handleChangeSemanticType = useCallback(
    (semanticType: string | null) => {
      // If we are changing the field from a FK to something else, we should delete any FKs present
      if (field.target && field.target.id != null && field.isFK()) {
        onUpdateField(field, {
          semantic_type: semanticType,
          fk_target_field_id: null,
        });
      } else {
        onUpdateField(field, { semantic_type: semanticType });
      }
    },
    [field, onUpdateField],
  );

  const handleChangeCurrency = useCallback(
    (currency: string) => {
      onUpdateField(field, {
        settings: { ...field.settings, currency },
      });
    },
    [field, onUpdateField],
  );

  const handleChangeTarget = useCallback(
    ({ target: { value: fk_target_field_id } }: SelectChangeEvent<FieldId>) => {
      onUpdateField(field, { fk_target_field_id });
    },
    [field, onUpdateField],
  );

  return (
    <div
      data-testid="semantic-type-target-picker"
      className={hasSeparator ? cx(CS.flex, CS.alignCenter) : undefined}
    >
      <SemanticTypePicker
        className={className}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
      />

      {showCurrencyTypeSelect && hasSeparator && <FieldSeparator />}

      {showCurrencyTypeSelect && (
        <CurrencyPicker
          className={cx(
            AdminS.TableEditorFieldTarget,
            CS.inlineBlock,
            hasSeparator ? CS.mt0 : CS.mt1,
            className,
          )}
          value={getFieldCurrency(field)}
          onChange={handleChangeCurrency}
        />
      )}

      {showFKTargetSelect && hasSeparator && <FieldSeparator />}

      {showFKTargetSelect && (
        <LegacySelect
          buttonProps={{
            "data-testid": "fk-target-select",
          }}
          disabled={!hasIdFields}
          className={cx(
            AdminS.TableEditorFieldTarget,
            CS.textWrap,
            hasSeparator ? CS.mt0 : CS.mt1,
            className,
          )}
          placeholder={getFkFieldPlaceholder(field, comparableIdFields)}
          searchProp={SEARCH_PROPS}
          value={field.fk_target_field_id}
          onChange={handleChangeTarget}
          options={comparableIdFields}
          optionValueFn={getFieldId}
          optionNameFn={includeSchema ? getFieldNameWithSchema : getFieldName}
          optionIconFn={getFieldIcon}
        />
      )}
    </div>
  );
};

const getFieldId = (field: Field) => {
  return field.id;
};

const getFieldIcon = () => {
  return null;
};

const getFieldName = (field: Field) => {
  return field.displayName({ includeTable: true });
};

const getFieldNameWithSchema = (field: Field) => {
  return field.displayName({ includeTable: true, includeSchema: true });
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

const getFkFieldPlaceholder = (field: Field, idFields: Field[]) => {
  const hasIdFields = idFields?.length > 0;
  const isRestrictedFKTargetSelected =
    field.isFK() &&
    field.fk_target_field_id != null &&
    !idFields?.some(idField => idField.id === field.fk_target_field_id);

  if (isRestrictedFKTargetSelected) {
    return t`Field access denied`;
  }

  return hasIdFields ? t`Select a target` : t`No key available`;
};

const hasMultipleSchemas = (field: Field[]) => {
  const schemas = new Set(field.map(field => field.table?.schema));
  return schemas.size > 1;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SemanticTypeAndTargetPicker;
