/* eslint-disable react/prop-types */
import { useSensor, PointerSensor } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback, useMemo } from "react";

import { SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { Icon } from "metabase/ui";

import { ParameterWidget } from "./ParameterWidget";

const getId = valuePopulatedParameter => valuePopulatedParameter.id;

function ParametersList({
  className,

  parameters,
  question,
  dashboard,
  editingParameter,

  isFullscreen,
  isNightMode,
  hideParameters,
  isEditing,
  vertical,
  commitImmediately,

  setParameterValueToDefault,
  setParameterValue,
  setParameterIndex,
  setEditingParameter,
  enableParameterRequiredBehavior,
}) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const visibleValuePopulatedParameters = useMemo(
    () => getVisibleParameters(parameters, hideParameters),
    [parameters, hideParameters],
  );

  const handleSortEnd = useCallback(
    ({ id, newIndex }) => {
      if (setParameterIndex) {
        setParameterIndex(id, newIndex);
      }
    },
    [setParameterIndex],
  );

  const renderItem = ({ item: valuePopulatedParameter, id }) => (
    <ParameterWidget
      key={`sortable-${id}`}
      className={cx({ [CS.mb2]: vertical })}
      isEditing={isEditing}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      parameter={valuePopulatedParameter}
      parameters={parameters}
      question={question}
      dashboard={dashboard}
      editingParameter={editingParameter}
      setEditingParameter={setEditingParameter}
      setValue={
        setParameterValue &&
        (value =>
          setParameterValue(valuePopulatedParameter.id, value, dashboard?.id))
      }
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
      commitImmediately={commitImmediately}
      dragHandle={
        isEditing && setParameterIndex ? (
          <div
            className={cx(
              CS.flex,
              CS.layoutCentered,
              CS.cursorGrab,
              "text-inherit",
            )}
          >
            <Icon name="grabber" />
          </div>
        ) : null
      }
      isSortable
    />
  );

  return visibleValuePopulatedParameters.length > 0 ? (
    <div
      className={cx(
        className,
        CS.flex,
        CS.alignEnd,
        CS.flexWrap,
        vertical ? CS.flexColumn : CS.flexRow,
      )}
    >
      <SortableList
        items={visibleValuePopulatedParameters}
        getId={getId}
        renderItem={renderItem}
        onSortEnd={handleSortEnd}
        sensors={[pointerSensor]}
      />
    </div>
  ) : null;
}

ParametersList.defaultProps = {
  vertical: false,
  commitImmediately: false,
};

export default ParametersList;
