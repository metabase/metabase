import { PointerSensor, useSensor } from "@dnd-kit/core";
import cx from "classnames";
import { forwardRef, useCallback, useMemo } from "react";

import type {
  DragEndEvent,
  RenderItemProps,
} from "metabase/common/components/Sortable";
import { SortableList } from "metabase/common/components/Sortable";
import CS from "metabase/css/core/index.css";
import type { ParametersListProps } from "metabase/parameters/components/ParametersList/types";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { Flex, Icon } from "metabase/ui";
import type { Parameter, ParameterId } from "metabase-types/api";

import { ParameterWidget } from "../ParameterWidget";

const getId = (valuePopulatedParameter: Parameter) =>
  valuePopulatedParameter.id;

export const ParametersList = forwardRef<HTMLDivElement, ParametersListProps>(
  function ParametersList(
    {
      className,

      parameters,
      linkedFilterParameters = parameters,
      cardId,
      dashboardId,
      editingParameter,

      isSortable = true,
      isFullscreen,
      hideParameters,
      isEditing,
      vertical = false,
      commitImmediately = false,

      setParameterValueToDefault,
      setParameterValue,
      setParameterIndex,
      setEditingParameter,
      enableParameterRequiredBehavior,
      widgetsWithinPortal,
      widgetsPopoverPosition,

      hasTestIdProps = true,
    },
    ref,
  ) {
    const pointerSensor = useSensor(PointerSensor, {
      activationConstraint: { distance: 15 },
    });

    const visibleValuePopulatedParameters = useMemo(
      () => getVisibleParameters(parameters, hideParameters),
      [parameters, hideParameters],
    );

    const handleSortEnd = useCallback(
      ({ id, newIndex }: DragEndEvent) => {
        if (setParameterIndex) {
          setParameterIndex(id as ParameterId, newIndex);
        }
      },
      [setParameterIndex],
    );

    const renderItem = ({
      item: valuePopulatedParameter,
      id,
    }: RenderItemProps<Parameter>) => (
      <ParameterWidget
        key={`sortable-${id}`}
        fullWidth={vertical}
        withinPortal={widgetsWithinPortal}
        popoverPosition={widgetsPopoverPosition}
        className={cx({ [CS.mb2]: vertical })}
        isEditing={isEditing}
        isFullscreen={isFullscreen}
        parameter={valuePopulatedParameter}
        parameters={linkedFilterParameters}
        cardId={cardId}
        dashboardId={dashboardId}
        editingParameter={editingParameter}
        setEditingParameter={setEditingParameter}
        setValue={
          setParameterValue &&
          ((value: any) => setParameterValue(valuePopulatedParameter.id, value))
        }
        setParameterValueToDefault={setParameterValueToDefault}
        enableParameterRequiredBehavior={enableParameterRequiredBehavior}
        commitImmediately={commitImmediately}
        dragHandle={
          isSortable && isEditing && setParameterIndex ? (
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
        isSortable={isSortable}
        hasTestId={hasTestIdProps}
      />
    );

    return visibleValuePopulatedParameters.length > 0 ? (
      <Flex
        display="flex"
        direction={vertical ? "column" : "row"}
        align="end"
        wrap="wrap"
        gap="sm"
        className={className}
        ref={ref}
        onMouseDown={(e) => {
          if (isEditing) {
            // Prevents clicking a filter in edit mode triggering card dragging
            e.stopPropagation();
          }
        }}
      >
        {isSortable ? (
          <SortableList
            items={visibleValuePopulatedParameters}
            getId={getId}
            renderItem={renderItem}
            onSortEnd={handleSortEnd}
            sensors={[pointerSensor]}
          />
        ) : (
          <>
            {visibleValuePopulatedParameters.map((parameter, index) =>
              renderItem({
                item: parameter,
                id: getId(parameter),
                index,
              }),
            )}
          </>
        )}
      </Flex>
    ) : null;
  },
);
