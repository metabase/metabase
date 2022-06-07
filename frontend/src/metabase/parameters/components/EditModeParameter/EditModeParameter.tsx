import React from "react";
import cx from "classnames";

import { SortableElement, SortableHandle } from "metabase/components/sortable";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import { UiParameter } from "metabase/parameters/types";

type EditModeParameterProps = {
  className?: string;
  parameter: UiParameter;
  isEditingParameter: boolean;
  setEditingParameter: (id: string | null) => void;
};

function EditModeParameter({
  className,
  parameter,
  isEditingParameter,
  setEditingParameter,
}: EditModeParameterProps) {
  return (
    <div
      className={cx(
        className,
        "flex align-center bordered rounded cursor-pointer text-bold mr1 mb1",
        {
          "bg-brand text-white": isEditingParameter,
          "text-brand-hover bg-white": !isEditingParameter,
        },
      )}
      onClick={() =>
        setEditingParameter(isEditingParameter ? null : parameter.id)
      }
      style={{
        padding: 8,
        width: 170,
        borderColor: isEditingParameter ? color("brand") : undefined,
      }}
    >
      <div className="mr1" onClick={e => e.stopPropagation()}>
        <Handle />
      </div>
      {parameter.name}
      <Icon className="flex-align-right" name="gear" />
    </div>
  );
}

const Handle = SortableHandle(() => (
  <div className="flex layout-centered cursor-grab text-inherit">
    <Icon name="grabber2" size={12} />
  </div>
));

export default SortableElement(EditModeParameter);
