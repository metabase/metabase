/* @flow */

import React from "react";

import Icon from "metabase/components/Icon";

import ColumnItem from "./ColumnItem";

const displayNameForColumn = column =>
  column ? column.display_name || column.name : "[Unknown]";

import type { NestedSettingComponentProps } from "./ChartSettingNestedSettings";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingColumns extends React.Component {
  props: NestedSettingComponentProps;

  render() {
    const {
      objects,
      onChangeEditingObject,
      objectSettingsWidgets,
      object,
    } = this.props;

    if (object) {
      return (
        <div>
          {/* only show the back button if we have more than one column */}
          {objects.length > 1 && (
            <div
              className="flex align-center mb2 cursor-pointer"
              onClick={() => onChangeEditingObject()}
            >
              <Icon name="chevronleft" className="text-light" />
              <span className="ml1 text-bold text-brand">
                {displayNameForColumn(object)}
              </span>
            </div>
          )}
          {objectSettingsWidgets}
        </div>
      );
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
