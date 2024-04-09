import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import { currency } from "cljs/metabase.shared.util.currency";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select, { Option } from "metabase/core/components/Select";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { trackStructEvent } from "metabase/lib/analytics";
import * as MetabaseCore from "metabase/lib/core";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import type Field from "metabase-lib/v1/metadata/Field";
import type { FieldFormattingSettings, FieldId } from "metabase-types/api";

import FieldSeparator from "../FieldSeparator";

const TYPE_OPTIONS = [
  ...MetabaseCore.field_semantic_types,
  {
    id: null,
    name: t`No semantic type`,
    section: t`Other`,
  },
];

const SEARCH_PROPS = [
  "display_name",
  "table.display_name",
  "table.schema_name",
];

interface TypeOption {
  id: string | null;
  name: string;
  section: string;
}

interface CurrencyOption {
  name: string;
  code: string;
  symbol: string;
}

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
  const hasIdFields = idFields.length > 0;
  const includeSchema = hasMultipleSchemas(idFields);
  const showFKTargetSelect = field.isFK();
  const showCurrencyTypeSelect = field.isCurrency();

  const handleChangeSemanticType = useCallback(
    ({ target: { value: semanticType } }: SelectChangeEvent<string>) => {
      // If we are changing the field from a FK to something else, we should delete any FKs present
      if (field.target && field.target.id != null && field.isFK()) {
        onUpdateField(field, {
          semantic_type: semanticType,
          fk_target_field_id: null,
        });
      } else {
        onUpdateField(field, { semantic_type: semanticType });
      }

      trackStructEvent("Data Model", "Update Field Special-Type", semanticType);
    },
    [field, onUpdateField],
  );

  const handleChangeCurrency = useCallback(
    ({ target: { value: currency } }: SelectChangeEvent<string>) => {
      onUpdateField(field, {
        settings: { ...field.settings, currency },
      });
      trackStructEvent("Data Model", "Update Currency Type", currency);
    },
    [field, onUpdateField],
  );

  const handleChangeTarget = useCallback(
    ({ target: { value: fk_target_field_id } }: SelectChangeEvent<FieldId>) => {
      onUpdateField(field, { fk_target_field_id });
      trackStructEvent("Data Model", "Update Field Target");
    },
    [field, onUpdateField],
  );

  return (
    <div
      data-testid="semantic-type-target-picker"
      className={hasSeparator ? cx(CS.flex, CS.alignCenter) : undefined}
    >
      <Select
        className={cx(AdminS.TableEditorFieldSemanticType, CS.mt0, className)}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
        options={TYPE_OPTIONS}
        optionValueFn={getTypeOptionId}
        optionSectionFn={getTypeOptionSection}
        placeholder={t`Select a semantic type`}
        searchProp="name"
        globalSearch
      />
      {showCurrencyTypeSelect && hasSeparator && <FieldSeparator />}
      {showCurrencyTypeSelect && (
        <Select
          className={cx(
            AdminS.TableEditorFieldTarget,
            CS.inlineBlock,
            hasSeparator ? CS.mt0 : CS.mt1,
            className,
          )}
          value={getFieldCurrency(field)}
          onChange={handleChangeCurrency}
          placeholder={t`Select a currency type`}
          searchProp="name"
          searchCaseSensitive={false}
        >
          {currency.map(([_, c]: CurrencyOption[]) => (
            <Option name={c.name} value={c.code} key={c.code}>
              <span className={cx(CS.flex, CS.full, CS.alignCenter)}>
                <span>{c.name}</span>
                <span className={cx(CS.textBold, CS.textLight, CS.ml1)}>
                  {c.symbol}
                </span>
              </span>
            </Option>
          ))}
        </Select>
      )}
      {showFKTargetSelect && hasSeparator && <FieldSeparator />}
      {showFKTargetSelect && (
        <Select
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
          placeholder={getFkFieldPlaceholder(field, idFields)}
          searchProp={SEARCH_PROPS}
          value={field.fk_target_field_id}
          onChange={handleChangeTarget}
          options={idFields}
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

const getTypeOptionId = (option: TypeOption) => {
  return option.id;
};

const getTypeOptionSection = (option: TypeOption) => {
  return option.section;
};

const hasMultipleSchemas = (field: Field[]) => {
  const schemas = new Set(field.map(field => field.table?.schema));
  return schemas.size > 1;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SemanticTypeAndTargetPicker;
