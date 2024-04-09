/* eslint-disable react/prop-types */
import { Component } from "react";

import { ColumnItem } from "./ColumnItem";

const displayNameForColumn = column =>
  column ? column.display_name || column.name : "[Unknown]";

// various props injected by chartSettingNestedSettings HOC
export default class ChartNestedSettingColumns extends Component {
  render() {
    const { object, objects, onChangeEditingObject } = this.props;
    if (object) {
      return <div>{this.props.objectSettingsWidgets}</div>;
    } else {
      return (
        <div>
          {objects.map((column, index) => (
            <ColumnItem
              key={index}
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
