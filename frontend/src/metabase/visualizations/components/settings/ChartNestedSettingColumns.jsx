/* eslint-disable react/prop-types */
import { Component } from "react";

import { ColumnItem } from "./ColumnItem";

const displayNameForColumn = (column) =>
  column ? column.display_name || column.name : "[Unknown]";

// various props injected by chartSettingNestedSettings HOC
export class ChartNestedSettingColumns extends Component {
  render() {
    const { object, objects, id, getObjectKey, onShowWidget } = this.props;
    if (object) {
      return <div>{this.props.objectSettingsWidgets}</div>;
    }
    return (
      <div>
        {objects.map((column, index) => (
          <ColumnItem
            key={index}
            title={displayNameForColumn(column)}
            onEdit={(target) =>
              onShowWidget(
                { id, props: { initialKey: getObjectKey(column) } },
                target,
              )
            }
          />
        ))}
      </div>
    );
  }
}
