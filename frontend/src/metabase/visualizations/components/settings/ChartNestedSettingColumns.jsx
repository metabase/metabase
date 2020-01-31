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

    if (setSidebarPropsOverride) {
      const overrides = { title: displayNameForColumn(object) };
      if (hasMultipleSections) {
        // We override `onBack` when there are multple hidden sections. If
        // section headers are hidden because we only have one, clicking back
        // should still return us to the visualization list.
        overrides.onBack =
          // If there is just one object, we reset the section when going back.
          // If there are multiple objects, we reset object selection to return
          // to the list of columns but stay in the current section.
          objects.length === 1 ? onShowSection : onChangeEditingObject;
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
