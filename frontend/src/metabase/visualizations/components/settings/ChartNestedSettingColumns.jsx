/* @flow */

import React from "react";

import ColumnItem from "./ColumnItem";

const displayNameForColumn = column =>
  column ? column.display_name || column.name : "[Unknown]";

import type { NestedSettingComponentProps } from "./ChartSettingNestedSettings";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingColumns extends React.Component {
  props: NestedSettingComponentProps;

  render() {
    const { object, objects, onChangeEditingObject } = this.props;
    if (object) {
      return <ColumnWidgets {...this.props} />;
    } else {
      return (
        <div>
          {objects.map(column => (
            <ColumnItem
              title={displayNameForColumn(column)}
              onEdit={() => onChangeEditingObject(column)}
              onClick={() => onChangeEditingObject(column)}
            />
          ))}
        </div>
      );
    }
  }
}

// ColumnWidgets is a component just to hook into mount/unmount
class ColumnWidgets extends React.Component {
  componentDidMount() {
    const {
      setSidebarPropsOverride,
      onChangeEditingObject,
      object,
    } = this.props;

    if (setSidebarPropsOverride) {
      setSidebarPropsOverride({
        title: displayNameForColumn(object),
        onBack: () => onChangeEditingObject(),
      });
    }
  }

  componentWillUnmount() {
    const { setSidebarPropsOverride } = this.props;
    if (setSidebarPropsOverride) {
      setSidebarPropsOverride(null);
    }
  }

  render() {
    return <div>{this.props.objectSettingsWidgets}</div>;
  }
}
