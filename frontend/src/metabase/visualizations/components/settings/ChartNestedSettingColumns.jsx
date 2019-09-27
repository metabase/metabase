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
      setSidebarTitleOverride,
      onChangeEditingObject,
      object,
    } = this.props;

    if (setSidebarTitleOverride) {
      setSidebarTitleOverride({
        title: displayNameForColumn(object),
        onBack: () => onChangeEditingObject(),
      });
    }
  }

  componentWillUnmount() {
    const { setSidebarTitleOverride } = this.props;
    if (setSidebarTitleOverride) {
      setSidebarTitleOverride(undefined);
    }
  }

  render() {
    return <div>{this.props.objectSettingsWidgets}</div>;
  }
}
