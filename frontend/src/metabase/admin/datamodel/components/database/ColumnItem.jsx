import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link, withRouter } from "react-router";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import Select, { Option } from "metabase/components/Select";
import Button from "metabase/components/Button";
import * as MetabaseCore from "metabase/lib/core";
import { isNumericBaseType, isCurrency } from "metabase/lib/schema_metadata";
import { TYPE, isa, isFK } from "metabase/lib/types";
import currency from "metabase/lib/currency";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";

import _ from "underscore";
import cx from "classnames";

import type { Field } from "metabase-types/types/Field";
import MetabaseAnalytics from "metabase/lib/analytics";

@withRouter
export default class Column extends Component {
  static propTypes = {
    field: PropTypes.object,
    idfields: PropTypes.array.isRequired,
    updateField: PropTypes.func.isRequired,
    dragHandle: PropTypes.node,
  };

  updateField = properties => {
    this.props.updateField({ ...this.props.field, ...properties });
  };

  handleChangeName = ({ target: { value: display_name } }) => {
    if (!_.isEmpty(display_name)) {
      this.updateField({ display_name });
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      this.updateField({ display_name: this.props.field.display_name });
    }
  };

  handleChangeDescription = ({ target: { value: description } }) => {
    this.updateField({ description });
  };

  render() {
    const { field, idfields, dragHandle } = this.props;

    return (
      <div className="p1 mt1 mb3 flex bordered rounded">
        <div className="flex flex-column flex-auto">
          <div>
            <InputBlurChange
              style={{ minWidth: 420 }}
              className="AdminInput TableEditor-field-name float-left bordered inline-block rounded text-bold"
              type="text"
              value={this.props.field.display_name || ""}
              onBlurChange={this.handleChangeName}
            />
            <div className="clearfix">
              <div className="flex flex-auto">
                <div className="pl1 flex-auto">
                  <FieldVisibilityPicker
                    className="block"
                    field={field}
                    updateField={this.updateField}
                  />
                </div>
                <div className="flex-auto px1">
                  <SpecialTypeAndTargetPicker
                    className="block"
                    field={field}
                    updateField={this.updateField}
                    idfields={idfields}
                  />
                </div>
                <Link
                  to={`${this.props.location.pathname}/${this.props.field.id}`}
                  className="text-brand-hover mr1"
                >
                  <Button icon="gear" style={{ padding: 10 }} />
                </Link>
              </div>
            </div>
          </div>
          <div className="MetadataTable-title flex flex-column flex-full bordered rounded mt1 mr1">
            <InputBlurChange
              className="AdminInput TableEditor-field-description"
              type="text"
              value={this.props.field.description || ""}
              onBlurChange={this.handleChangeDescription}
              placeholder={t`No column description yet`}
            />
          </div>
        </div>
        {dragHandle}
      </div>
    );
  }
}

// FieldVisibilityPicker and SpecialTypeSelect are also used in FieldApp

export class FieldVisibilityPicker extends Component {
  props: {
    field: Field,
    updateField: Field => void,
    className?: string,
  };

  handleChangeVisibility = ({ target: { value: visibility_type } }) => {
    this.props.updateField({ visibility_type });
  };

  render() {
    const { field, className } = this.props;

    return (
      <Select
        className={cx("TableEditor-field-visibility", className)}
        value={field.visibility_type}
        onChange={this.handleChangeVisibility}
        options={MetabaseCore.field_visibility_types}
        optionValueFn={o => o.id}
        placeholder={t`Select a field visibility`}
      />
    );
  }
}

export class SpecialTypeAndTargetPicker extends Component {
  props: {
    field: Field,
    updateField: Field => void,
    className?: string,
    selectSeparator?: React$Element<any>,
  };

  handleChangeSpecialType = async ({ target: { value: special_type } }) => {
    const { field, updateField } = this.props;

    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && isFK(field.special_type)) {
      await updateField({
        special_type,
        fk_target_field_id: null,
      });
    } else {
      await updateField({ special_type });
    }

    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Update Field Special-Type",
      special_type,
    );
  };

  handleChangeCurrency = async ({ target: { value: currency } }) => {
    const { field, updateField } = this.props;
    await updateField({
      settings: {
        ...(field.settings || {}),
        currency,
      },
    });
    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Update Currency Type",
      currency,
    );
  };

  handleChangeTarget = async ({ target: { value: fk_target_field_id } }) => {
    await this.props.updateField({ fk_target_field_id });
    MetabaseAnalytics.trackEvent("Data Model", "Update Field Target");
  };

  render() {
    const { field, className, selectSeparator } = this.props;

    let specialTypes = [
      ...MetabaseCore.field_special_types,
      {
        id: null,
        name: t`No special type`,
        section: t`Other`,
      },
    ];
    // if we don't have a numeric base-type then prevent the options for unix timestamp conversion (#823)
    if (!isNumericBaseType(field)) {
      specialTypes = specialTypes.filter(f => !isa(f.id, TYPE.UNIXTimestamp));
    }

    const showFKTargetSelect = isFK(field.special_type);

    const showCurrencyTypeSelect = isCurrency(field);

    let { idfields } = this.props;

    // If all FK target fields are in the same schema (like `PUBLIC` for sample dataset)
    // or if there are no schemas at all, omit the schema name
    const includeSchema =
      _.uniq(idfields.map(idField => idField.table.schema_name)).length > 1;

    idfields = _.sortBy(idfields, field =>
      field.displayName({ includeTable: true, includeSchema }),
    );

    return (
      <div className={cx(selectSeparator ? "flex align-center" : null)}>
        <Select
          className={cx("TableEditor-field-special-type mt0", className)}
          value={field.special_type}
          onChange={this.handleChangeSpecialType}
          options={specialTypes}
          optionValueFn={o => o.id}
          optionSectionFn={o => o.section}
          placeholder={t`Select a special type`}
          searchProp="name"
        />
        {showCurrencyTypeSelect && selectSeparator}
        {// TODO - now that we have multiple "nested" options like choosing a
        // FK table and a currency type we should make this more generic and
        // handle a "secondary" input more elegantly
        showCurrencyTypeSelect && (
          <Select
            className={cx(
              "TableEditor-field-target inline-block",
              selectSeparator ? "mt0" : "mt1",
              className,
            )}
            value={
              (field.settings && field.settings.currency) ||
              getGlobalSettingsForColumn(field).currency ||
              "USD"
            }
            onChange={this.handleChangeCurrency}
            placeholder={t`Select a currency type`}
            searchProp="name"
            searchCaseSensitive={false}
          >
            {Object.values(currency).map(c => (
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
            className={cx(
              "TableEditor-field-target text-wrap",
              selectSeparator ? "mt0" : "mt1",
              className,
            )}
            placeholder={t`Select a target`}
            searchProp="name"
            value={field.fk_target_field_id}
            onChange={this.handleChangeTarget}
            options={idfields}
            optionValueFn={field => field.id}
            optionNameFn={field =>
              field.displayName({ includeTable: true, includeSchema })
            }
            optionIconFn={field => null}
          />
        )}
      </div>
    );
  }
}
