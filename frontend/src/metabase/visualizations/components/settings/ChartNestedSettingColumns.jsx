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
      object,
      onEndShowWidget,
      currentSectionHasColumnSettings,
    } = this.props;

    // These two props (title and onBack) are overridden to display a column
    // name instead of the visualization type when viewing a column's settings.
    // If the column setting is directly within the section rather than an
    // additional widget we drilled into, clicking back should still return us
    // to the visualization list. In that case, we don't override these at all.
    if (setSidebarPropsOverride && !currentSectionHasColumnSettings) {
      setSidebarPropsOverride({
        title: displayNameForColumn(object),
        onBack: onEndShowWidget,
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
