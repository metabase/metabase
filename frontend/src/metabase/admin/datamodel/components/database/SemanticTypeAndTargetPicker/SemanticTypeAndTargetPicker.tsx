import React from "react";
import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { currency } from "cljs/metabase.shared.util.currency";

import Select, {
  OnChangeHandler,
  Option,
} from "metabase/core/components/Select";
import * as MetabaseCore from "metabase/lib/core";
import { isCurrency } from "metabase/lib/schema_metadata";
import { isFK } from "metabase/lib/types";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { Field } from "metabase-types/types/Field";

const semanticTypes = [
  ...MetabaseCore.field_semantic_types,
  {
    id: null,
    name: t`No semantic type`,
    section: t`Other`,
  },
];

interface SemanticTypeAndTargetPickerProps {
  field: Field;
  updateField: (field: Partial<Field>) => Promise<void>;
  className?: string;
  selectSeparator?: React.ReactNode;
  idfields: any[];
  disabled?: boolean;
}

const SemanticTypeAndTargetPicker = ({
  field,
  updateField,
  idfields,
  className,
  selectSeparator,
  disabled,
}: SemanticTypeAndTargetPickerProps) => {
  const handleChangeSemanticType: OnChangeHandler<string> = async ({
    target: { value: semantic_type },
  }) => {
    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && isFK(field.semantic_type)) {
      await updateField({
        semantic_type,
        fk_target_field_id: null,
      });
    } else {
      await updateField({ semantic_type });
    }

    MetabaseAnalytics.trackStructEvent(
      "Data Model",
      "Update Field Special-Type",
      semantic_type,
    );
  };

  const handleChangeCurrency: OnChangeHandler<string> = async ({
    target: { value: currency },
  }) => {
    await updateField({
      settings: {
        ...(field.settings || {}),
        currency,
      },
    });
    MetabaseAnalytics.trackStructEvent(
      "Data Model",
      "Update Currency Type",
      currency,
    );
  };

  const handleChangeTarget: OnChangeHandler<number> = async ({
    target: { value: fk_target_field_id },
  }) => {
    await updateField({ fk_target_field_id });
    MetabaseAnalytics.trackStructEvent("Data Model", "Update Field Target");
  };

  const showFKTargetSelect = isFK(field.semantic_type);

  const showCurrencyTypeSelect = isCurrency(field);

  // If all FK target fields are in the same schema (like `PUBLIC` for sample database)
  // or if there are no schemas at all, omit the schema name
  const includeSchema =
    _.uniq(idfields.map((idField: any) => idField.table.schema_name)).length >
    1;

  idfields = _.sortBy(idfields, field =>
    field.displayName({ includeTable: true, includeSchema }),
  );

  return (
    <div className={cx(selectSeparator ? "flex align-center" : null)}>
      <Select
        className={cx("TableEditor-field-semantic-type mt0", className)}
        value={field.semantic_type}
        onChange={handleChangeSemanticType}
        options={semanticTypes}
        optionValueFn={(o: any) => o.id}
        optionSectionFn={(o: any) => o.section}
        placeholder={t`Select a semantic type`}
        searchProp="name"
        disabled={disabled}
      />
      {showCurrencyTypeSelect && selectSeparator}
      {// TODO - now that we have multiple "nested" options like choosing a
      // FK table and a currency type we should make this more generic and
      // handle a "secondary" input more elegantly
      showCurrencyTypeSelect && (
        <Select
          disabled={disabled}
          className={cx(
            "TableEditor-field-target inline-block",
            selectSeparator ? "mt0" : "mt1",
            className,
          )}
          value={
            (field.settings && field.settings.currency) ||
            (getGlobalSettingsForColumn(field) as any).currency ||
            "USD"
          }
          onChange={handleChangeCurrency}
          placeholder={t`Select a currency type`}
          searchProp="name"
          searchCaseSensitive={false}
        >
          {currency.map(([_, c]: any) => (
            <Option name={c.name} value={c.code} key={c.code}>
              <span className="flex full align-center">
                <span>{c.name}</span>
                <span className="text-bold text-light ml1">{c.symbol}</span>
              </span>
            </Option>
          ))}
        </Select>
      )}
      {showFKTargetSelect && selectSeparator}
      {showFKTargetSelect && (
        <Select
          disabled={disabled}
          className={cx(
            "TableEditor-field-target text-wrap",
            selectSeparator ? "mt0" : "mt1",
            className,
          )}
          placeholder={t`Select a target`}
          searchProp={[
            "display_name",
            "table.display_name",
            "table.schema_name",
          ]}
          value={field.fk_target_field_id}
          onChange={handleChangeTarget}
          options={idfields}
          optionValueFn={(field: Field) => field.id}
          optionNameFn={(field: Field) =>
            field.displayName({ includeTable: true, includeSchema })
          }
          optionIconFn={() => null}
        />
      )}
    </div>
  );
};

export default SemanticTypeAndTargetPicker;
