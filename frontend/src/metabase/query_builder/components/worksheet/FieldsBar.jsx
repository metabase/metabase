import React from "react";

import cx from "classnames";

import Icon from "metabase/components/Icon";

import DimensionDragSource from "./dnd/DimensionDragSource";

const items = [
  { name: "ID", icon: "int" },
  { name: "Created At", icon: "calendar" },
];

export default class FieldsBar extends React.Component {
  render() {
    const {
      color,
      dimensions,
      isPickerOpen,
      onOpenPicker,
      onClosePicker,
      onAdd,
      className,
    } = this.props;
    return (
      <div className={cx("flex align-center mt2 overflow-hidden", className)}>
        <Icon name="chevronright" className="mr2" style={{ color }} />
        {dimensions.map(dimension => (
          <DimensionDragSource dimension={dimension} className="flex-no-shrink">
            <div className="bordered rounded shadowed bg-white py1 px2 mr1 text-medium cursor-pointer text-bold">
              {
                <Icon
                  size={12}
                  name={dimension.field().icon()}
                  className="mr1"
                />
              }
              {dimension.displayName()}
            </div>
          </DimensionDragSource>
        ))}
        <div className="flex align-center">
          {onOpenPicker && (
            <Icon
              name="ellipsis"
              className={cx(
                "rounded cursor-pointer px1",
                isPickerOpen ? "bg-brand text-white" : "bg-medium text-brand",
              )}
              onClick={isPickerOpen ? onClosePicker : onOpenPicker}
            />
          )}
          {onAdd && <Icon name="add" />}
        </div>
      </div>
    );
  }
}
