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
      objects,
      hasMultipleSections,
      onChangeEditingObject,
      onShowSection,
    } = this.props;

    // These two props (title and onBack) are overridden to display a column
    // name instead of the visualization type when viewing a column's settings.
    if (setSidebarPropsOverride) {
      const overrides = { title: displayNameForColumn(object) };
      if (objects.length > 1) {
        // If there are multiple objects, we reset object selection to return
        // to the list of columns but stay in the current section.
        // $FlowFixMe onBack isn't always set
        overrides.onBack = onChangeEditingObject;
      } else if (hasMultipleSections) {
        // If there is just one object, we reset the section when going back. If
        // there aren't multiple sections clicking back should still return us
        // to the visualization list, so we don't override `onBack` at all.
        // $FlowFixMe onBack isn't always set
        overrides.onBack = onShowSection;
      }
      setSidebarPropsOverride(overrides);
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
