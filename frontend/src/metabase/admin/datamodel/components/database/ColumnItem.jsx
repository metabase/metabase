import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link, withRouter } from "react-router";

import InputBlurChange from "metabase/components/InputBlurChange";
import Select, { Option } from "metabase/components/Select";
import Icon from "metabase/components/Icon";
import { t } from "ttag";
import * as MetabaseCore from "metabase/lib/core";
import { isNumericBaseType, isCurrency } from "metabase/lib/schema_metadata";
import { TYPE, isa, isFK } from "metabase/lib/types";
import currency from "metabase/lib/currency";
import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";

import _ from "underscore";
import cx from "classnames";

import type { Field } from "metabase/meta/types/Field";
import MetabaseAnalytics from "metabase/lib/analytics";

@withRouter
export default class Column extends Component {
  static propTypes = {
    field: PropTypes.object,
    idfields: PropTypes.array.isRequired,
    updateField: PropTypes.func.isRequired,
  };

  updateField = properties =>
    this.props.updateField({
      ...this.props.field.getPlainObject(),
      ...properties,
    });

  onNameChange = event => {
    if (!_.isEmpty(event.target.value)) {
      this.updateField({ display_name: event.target.value });
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      event.target.value = this.props.field.display_name;
    }
  };

  onDescriptionChange = event =>
    this.updateField({ description: event.target.value });

  onVisibilityChange = ({ id: visibility_type }) =>
    this.updateField({ visibility_type });

  render() {
    const { field, idfields } = this.props;

    return (
      <li className="mt1 mb3 flex">
        <div className="flex flex-column flex-auto">
          <div>
            <InputBlurChange
              style={{ minWidth: 420 }}
              className="AdminInput TableEditor-field-name float-left bordered inline-block rounded text-bold"
              type="text"
              value={this.props.field.display_name || ""}
              onBlurChange={this.onNameChange}
            />
            <div className="clearfix">
              <div className="flex flex-auto">
                <div className="flex-auto pl1">
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
              </div>
            </div>
          </div>
          <div className="MetadataTable-title flex flex-column flex-full bordered rounded mt1 mr1">
            <InputBlurChange
              className="AdminInput TableEditor-field-description"
              type="text"
              value={this.props.field.description || ""}
              onBlurChange={this.onDescriptionChange}
              placeholder={t`No column description yet`}
            />
          </div>
        </div>
        <Link
          to={`${this.props.location.pathname}/${this.props.field.id}`}
          className="text-brand-hover mx2 mt1"
        >
          <Icon name="gear" />
        </Link>
      </li>
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

  onVisibilityChange = ({ id: visibility_type }) =>
    this.props.updateField({ visibility_type });

  render() {
    const { field, className } = this.props;

    return (
      <Select
        className={cx("TableEditor-field-visibility", className)}
        placeholder={t`Select a field visibility`}
        value={MetabaseCore.field_visibility_types.find(
          type => type.id === field.visibility_type,
        )}
        options={MetabaseCore.field_visibility_types}
        onChange={this.onVisibilityChange}
        triggerClasses={this.props.triggerClasses}
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

  onSpecialTypeChange = async ({ id: special_type }) => {
    const { field, updateField } = this.props;

    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && isFK(field.special_type)) {
      await updateField({
        special_type,
        target: null,
        k_target_field_id: null,
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

  onCurrencyTypeChange = async currency => {
    const { field, updateField } = this.props;

    // FIXME: mutation
    field.settings = {
      ...(field.settings || {}),
      currency,
    };

    await updateField(field);
    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Update Currency Type",
      currency,
    );
  };

  onTargetChange = async ({ id: fk_target_field_id }) => {
    await this.props.updateField({ fk_target_field_id });

    MetabaseAnalytics.trackEvent("Data Model", "Update Field Target");
  };

  render() {
    const { field, className, selectSeparator } = this.props;

    let specialTypes = MetabaseCore.field_special_types.slice(0);
    specialTypes.push({
      id: null,
      name: t`No special type`,
      section: t`Other`,
    });
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
      _.uniq(idfields.map(idField => idField.table.schema)).length > 1;

    idfields = _.sortBy(idfields, field =>
      field.displayName({ includeTable: true, includeSchema }),
    );

    return (
      <div>
        <Select
          className={cx("TableEditor-field-special-type", "mt0", className)}
          placeholder={t`Select a special type`}
          value={MetabaseCore.field_special_types.find(
            type => type.id === field.special_type,
          )}
          options={specialTypes}
          onChange={this.onSpecialTypeChange}
          triggerClasses={this.props.triggerClasses}
        />
        {showCurrencyTypeSelect && selectSeparator}
        {// TODO - now that we have multiple "nested" options like choosing a
        // FK table and a currency type we should make this more generic and
        // handle a "secondary" input more elegantly
        showCurrencyTypeSelect && (
          <Select
            className={cx(
              "TableEditor-field-target",
              "inline-block",
              className,
            )}
            triggerClasses={this.props.triggerClasses}
            value={
              (field.settings && field.settings.currency) ||
              getGlobalSettingsForColumn(field).currency ||
              "USD"
            }
            onChange={({ target }) => this.onCurrencyTypeChange(target.value)}
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
            className={cx("TableEditor-field-target", "text-wrap", className)}
            triggerClasses={this.props.triggerClasses}
            placeholder={t`Select a target`}
            value={idfields.find(
              idField => idField.id === field.fk_target_field_id,
            )}
            options={idfields}
            optionNameFn={field =>
              field.displayName({ includeTable: true, includeSchema })
            }
            onChange={this.onTargetChange}
          />
        )}
      </div>
    );
  }
}
