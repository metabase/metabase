/* eslint-disable react/prop-types */
import React from "react";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "react-sortable-hoc";
import cx from "classnames";

import StaticParameterWidget from "./ParameterWidget";
import Icon from "metabase/components/Icon";
import {
  getValuePopulatedParameters,
  getVisibleParameters,
} from "metabase/meta/Parameter";

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

  setParameterName?: (parameterId: ParameterId, name: string) => void,
  setParameterValue?: (parameterId: ParameterId, value: string) => void,
  setParameterDefaultValue?: (
    parameterId: ParameterId,
    defaultValue: string,
  ) => void,
  setParameterIndex?: (parameterId: ParameterId, index: number) => void,
  removeParameter?: (parameterId: ParameterId) => void,
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

  setParameterName,
  setParameterValue,
  setParameterDefaultValue,
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
          setName={
            setParameterName &&
            (name => setParameterName(valuePopulatedParameter.id, name))
          }
          setValue={
            setParameterValue &&
            (value => setParameterValue(valuePopulatedParameter.id, value))
          }
          setDefaultValue={
            setParameterDefaultValue &&
            (value =>
              setParameterDefaultValue(valuePopulatedParameter.id, value))
          }
          remove={
            removeParameter &&
            (() => removeParameter(valuePopulatedParameter.id))
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
