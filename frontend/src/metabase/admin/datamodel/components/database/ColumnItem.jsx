import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link, withRouter } from "react-router";

import InputBlurChange from "metabase/components/InputBlurChange.jsx";
import Select from "metabase/components/Select.jsx";
import Icon from "metabase/components/Icon";
import { t } from "c-3po";
import * as MetabaseCore from "metabase/lib/core";
import { titleize, humanize } from "metabase/lib/formatting";
import { isNumericBaseType } from "metabase/lib/schema_metadata";
import { TYPE, isa, isFK } from "metabase/lib/types";

import _ from "underscore";
import cx from "classnames";

import type { Field } from "metabase/meta/types/Field";
import MetabaseAnalytics from "metabase/lib/analytics";

@withRouter
export default class Column extends Component {
  constructor(props, context) {
    super(props, context);
    this.onDescriptionChange = this.onDescriptionChange.bind(this);
    this.onNameChange = this.onNameChange.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  static propTypes = {
    field: PropTypes.object,
    idfields: PropTypes.array.isRequired,
    updateField: PropTypes.func.isRequired,
  };

  updateProperty(name, value) {
    this.props.field[name] = value;
    this.props.updateField(this.props.field);
  }

  onNameChange(event) {
    if (!_.isEmpty(event.target.value)) {
      this.updateProperty("display_name", event.target.value);
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      event.target.value = this.props.field.display_name;
    }
  }

  onDescriptionChange(event) {
    this.updateProperty("description", event.target.value);
  }

  onVisibilityChange(type) {
    this.updateProperty("visibility_type", type.id);
  }

  render() {
    const { field, idfields, updateField } = this.props;

    return (
      <li className="mt1 mb3 flex">
        <div className="flex flex-column flex-full">
          <div>
            <InputBlurChange
              style={{ minWidth: 420 }}
              className="AdminInput TableEditor-field-name float-left bordered inline-block rounded text-bold"
              type="text"
              value={this.props.field.display_name || ""}
              onBlurChange={this.onNameChange}
            />
            <div className="clearfix">
              <div className="flex flex-full">
                <div className="flex-full px1">
                  <FieldVisibilityPicker
                    className="block"
                    field={field}
                    updateField={updateField}
                  />
                </div>
                <div className="flex-full px1">
                  <SpecialTypeAndTargetPicker
                    className="block"
                    field={field}
                    updateField={updateField}
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

  onVisibilityChange = visibilityType => {
    const { field } = this.props;
    field.visibility_type = visibilityType.id;
    this.props.updateField(field);
  };

  render() {
    const { field, className } = this.props;

    return (
      <Select
        className={cx("TableEditor-field-visibility block", className)}
        placeholder={t`Select a field visibility`}
        value={_.find(MetabaseCore.field_visibility_types, type => {
          return type.id === field.visibility_type;
        })}
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

  onSpecialTypeChange = async special_type => {
    const { field, updateField } = this.props;
    field.special_type = special_type.id;

    // If we are changing the field from a FK to something else, we should delete any FKs present
    if (field.target && field.target.id != null && isFK(field.special_type)) {
      // we have something that used to be an FK and is now not an FK
      // clean up after ourselves
      field.target = null;
      field.fk_target_field_id = null;
    }

    await updateField(field);

    MetabaseAnalytics.trackEvent(
      "Data Model",
      "Update Field Special-Type",
      field.special_type,
    );
  };

  onTargetChange = async target_field => {
    const { field, updateField } = this.props;
    field.fk_target_field_id = target_field.id;

    await updateField(field);

    MetabaseAnalytics.trackEvent("Data Model", "Update Field Target");
  };

  render() {
    const { field, idfields, className, selectSeparator } = this.props;

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

    // If all FK target fields are in the same schema (like `PUBLIC` for sample dataset)
    // or if there are no schemas at all, omit the schema name
    const includeSchemaName =
      _.uniq(idfields.map(idField => idField.table.schema)).length > 1;

    return (
      <div>
        <Select
          className={cx("TableEditor-field-special-type", className)}
          placeholder={t`Select a special type`}
          value={_.find(
            MetabaseCore.field_special_types,
            type => type.id === field.special_type,
          )}
          options={specialTypes}
          onChange={this.onSpecialTypeChange}
          triggerClasses={this.props.triggerClasses}
        />
        {showFKTargetSelect && selectSeparator}
        {showFKTargetSelect && (
          <Select
            className={cx("TableEditor-field-target", className)}
            triggerClasses={this.props.triggerClasses}
            placeholder={t`Select a target`}
            value={
              field.fk_target_field_id &&
              _.find(
                idfields,
                idField => idField.id === field.fk_target_field_id,
              )
            }
            options={idfields}
            optionNameFn={idField =>
              includeSchemaName
                ? titleize(humanize(idField.table.schema)) +
                  "." +
                  idField.displayName
                : idField.displayName
            }
            onChange={this.onTargetChange}
          />
        )}
      </div>
    );
  }
}
