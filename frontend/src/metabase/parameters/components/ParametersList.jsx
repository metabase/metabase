/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "metabase/components/sortable";
import {
  getValuePopulatedParameters,
  getVisibleParameters,
} from "metabase/meta/Parameter";

import StaticParameterWidget from "./ParameterWidget";

import type {
  ParameterId,
  Parameter,
  ParameterValues,
} from "metabase-types/types/Parameter";
import type { DashboardWithCards } from "metabase-types/types/Dashboard";

type Props = {
  className?: string,

  parameters: Parameter[],
  dashboard?: DashboardWithCards,
  editingParameter?: ?Parameter,
  parameterValues?: ParameterValues,

  isFullscreen?: boolean,
  isNightMode?: boolean,
  hideParameters?: ?string, // comma separated list of slugs
  isEditing?: boolean,
  isQB?: boolean,
  vertical?: boolean,
  commitImmediately?: boolean,

  setParameterIndex?: (parameterId: ParameterId, index: number) => void,
  setEditingParameter?: (parameterId: ParameterId) => void,
};

const StaticParameterWidgetList = ({
  children,
  onSortStart,
  onSortEnd,
  ...props
}) => {
  return <div {...props}>{children}</div>;
};

const SortableParameterHandle = SortableHandle(() => (
  <div className="flex layout-centered cursor-grab text-inherit">
    <Icon name="grabber2" size={12} />
  </div>
));

const SortableParameterWidget = SortableElement(StaticParameterWidget);
const SortableParameterWidgetList = SortableContainer(
  StaticParameterWidgetList,
);

function ParametersList({
  className,

  parameters,
  dashboard,
  editingParameter,
  parameterValues,

  isFullscreen,
  isNightMode,
  hideParameters,
  isEditing,
  isQB,
  vertical,
  commitImmediately,

  setParameterValue,
  setParameterIndex,
  removeParameter,
  setEditingParameter,
}: Props) {
  const handleSortStart = () => {
    document.body.classList.add("grabbing");
  };

  const handleSortEnd = ({
    oldIndex,
    newIndex,
  }: {
    oldIndex: number,
    newIndex: number,
  }) => {
    document.body.classList.remove("grabbing");
    if (setParameterIndex) {
      setParameterIndex(parameters[oldIndex].id, newIndex);
    }
  };

  const valuePopulatedParameters = getValuePopulatedParameters(
    parameters,
    parameterValues,
  );

  const visibleValuePopulatedParameters = getVisibleParameters(
    valuePopulatedParameters,
    hideParameters,
  );

  let ParameterWidget;
  let ParameterWidgetList;
  if (isEditing) {
    ParameterWidget = SortableParameterWidget;
    ParameterWidgetList = SortableParameterWidgetList;
  } else {
    ParameterWidget = StaticParameterWidget;
    ParameterWidgetList = StaticParameterWidgetList;
  }

  return (
    <ParameterWidgetList
      className={cx(
        className,
        "flex align-end flex-wrap",
        vertical ? "flex-column" : "flex-row",
        { mt1: isQB },
      )}
      axis="x"
      distance={9}
      onSortStart={handleSortStart}
      onSortEnd={handleSortEnd}
    >
      {visibleValuePopulatedParameters.map((valuePopulatedParameter, index) => (
        <ParameterWidget
          key={valuePopulatedParameter.id}
          className={cx({ mb2: vertical })}
          isEditing={isEditing}
          isFullscreen={isFullscreen}
          isNightMode={isNightMode}
          parameter={valuePopulatedParameter}
          parameters={valuePopulatedParameters}
          dashboard={dashboard}
          editingParameter={editingParameter}
          setEditingParameter={setEditingParameter}
          index={index}
          setValue={
            setParameterValue &&
            (value => setParameterValue(valuePopulatedParameter.id, value))
          }
          commitImmediately={commitImmediately}
          dragHandle={
            isEditing && setParameterIndex ? <SortableParameterHandle /> : null
          }
        />
      ))}
    </ParameterWidgetList>
  );
}

ParametersList.defaultProps = {
  vertical: false,
  commitImmediately: false,
};

export default ParametersList;
