/* eslint-disable react/prop-types */
import { useSensor, PointerSensor } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback, useMemo } from "react";

import { SortableList, Sortable } from "metabase/core/components/Sortable";
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
    activationConstraint: { distance: 0 },
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
    <Sortable
      id={id}
      key={`sortable-${id}`}
      disabled={!isEditing}
      draggingStyle={{ opacity: 0.5 }}
      role="listitem"
    >
      <ParameterWidget
        className={cx({ mb2: vertical })}
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
          (value => setParameterValue(valuePopulatedParameter.id, value))
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
      />
    </Sortable>
  );

  return visibleValuePopulatedParameters.length > 0 ? (
    <div
      className={cx(
        className,
        CS.flex,
        "align-end flex-wrap",
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
