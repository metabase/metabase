import React, { Component } from "react";

import CheckBox from "metabase/components/CheckBox.jsx";
import Icon from "metabase/components/Icon.jsx";

import { SortableContainer, SortableElement } from "react-sortable-hoc";

import cx from "classnames";
import _ from "underscore";

const SortableField = SortableElement(
  ({ field, columnNames, onSetEnabled }) => (
    <div
      className={cx("flex align-center p1", {
        "text-grey-2": !field.enabled,
      })}
    >
      <CheckBox
        checked={field.enabled}
        onChange={e => onSetEnabled(e.target.checked)}
      />
      <span className="ml1 h4">{columnNames[field.name]}</span>
      <Icon
        className="flex-align-right text-grey-2 mr1 cursor-pointer"
        name="grabber"
        width={14}
        height={14}
      />
    </div>
  ),
);

const SortableFieldList = SortableContainer(
  ({ fields, columnNames, onSetEnabled }) => {
    return (
      <div>
        {fields.map((field, index) => (
          <SortableField
            key={`item-${index}`}
            index={index}
            field={field}
            columnNames={columnNames}
            onSetEnabled={enabled => onSetEnabled(index, enabled)}
          />
        ))}
      </div>
    );
  },
);

export default class ChartSettingOrderedFields extends Component {
  handleSetEnabled = (index, checked) => {
    const fields = [...this.props.value];
    fields[index] = { ...fields[index], enabled: checked };
    this.props.onChange(fields);
  };

  handleToggleAll = anyEnabled => {
    const fields = this.props.value.map(field => ({
      ...field,
      enabled: !anyEnabled,
    }));
    this.props.onChange([...fields]);
  };

  handleSortEnd = ({ oldIndex, newIndex }) => {
    const fields = [...this.props.value];
    fields.splice(newIndex, 0, fields.splice(oldIndex, 1)[0]);
    this.props.onChange(fields);
  };

  isAnySelected = () => {
    const { value } = this.props;
    return _.any(value, field => field.enabled);
  };

  render() {
    const { value, columnNames } = this.props;
    const anyEnabled = this.isAnySelected();
    return (
      <div className="list">
        <div className="toggle-all">
          <div
            className={cx("flex align-center p1", {
              "text-grey-2": !anyEnabled,
            })}
          >
            <CheckBox
              checked={anyEnabled}
              className={cx("text-brand", { "text-grey-2": !anyEnabled })}
              onChange={e => this.handleToggleAll(anyEnabled)}
              invertChecked
            />
            <span className="ml1 h4">
              {anyEnabled ? "Unselect all" : "Select all"}
            </span>
          </div>
        </div>
        <SortableFieldList
          fields={value}
          columnNames={columnNames}
          onSetEnabled={this.handleSetEnabled}
          onSortEnd={this.handleSortEnd}
          distance={5}
          helperClass="z5"
        />
      </div>
    );
  }
}
