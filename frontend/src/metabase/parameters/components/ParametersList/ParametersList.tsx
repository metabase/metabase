import { useSensor, PointerSensor } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback, useMemo, useState } from "react";

import type {
  DragEndEvent,
  RenderItemProps,
} from "metabase/core/components/Sortable";
import { SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import type { ParametersListProps } from "metabase/parameters/components/ParametersList/types";
import { getVisibleParameters } from "metabase/parameters/utils/ui";
import { FilterButton } from "metabase/query_builder/components/ResponsiveParametersList.styled";
import { Icon } from "metabase/ui";
import type { Parameter, ParameterId } from "metabase-types/api";

import { ParameterWidget } from "../ParameterWidget";

const getId = (valuePopulatedParameter: Parameter) =>
  valuePopulatedParameter.id;

export const ParametersList = ({
  className,
  parameters,
  question,
  dashboard,
  editingParameter,
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
}: ParametersListProps) => {
  const [showFilterList, setShowFilterList] = useState(true);
  const [showRequiredFilters, setShowRequiredFilters] = useState(true);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const visibleValuePopulatedParameters = useMemo(() => {
    const visibleParams = getVisibleParameters(parameters, hideParameters);
    return visibleParams.filter(
      parameter =>
        isEditing || // If you're in edit mode, we'll show you all the parameters
        (!parameter.name.startsWith("#hide") &&
          !parameter.name.endsWith("#hide")), // Filter the parameters with #hide
    );
  }, [parameters, hideParameters, isEditing]);

  const requiredFilters = useMemo(() => {
    return visibleValuePopulatedParameters.filter(
      parameter => parameter.required,
    );
  }, [visibleValuePopulatedParameters]);

  const optionalFilters = useMemo(() => {
    return visibleValuePopulatedParameters.filter(
      parameter => !parameter.required,
    );
  }, [visibleValuePopulatedParameters]);

  const hasOptionalFilters = useMemo(() => {
    return optionalFilters.length > 0;
  }, [optionalFilters]);

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
      className={cx({ [CS.mb2]: vertical })}
      isEditing={isEditing}
      isFullscreen={isFullscreen}
      parameter={valuePopulatedParameter}
      parameters={parameters}
      question={question}
      dashboard={dashboard}
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

  const toggleFilterList = useCallback(() => {
    setShowFilterList(show => !show);
  }, []);

  const toggleRequiredFilters = useCallback(() => {
    setShowRequiredFilters(show => !show);
  }, []);

  return (
    <>
      {question && (hasOptionalFilters || requiredFilters.length > 0) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          {requiredFilters.length > 0 && (
            <FilterButton
              borderless
              primary
              icon="filter"
              onClick={toggleRequiredFilters}
            >
              {showRequiredFilters ? `Required Filters` : `Required Filters`}
            </FilterButton>
          )}
          {hasOptionalFilters && (
            <FilterButton
              borderless
              primary
              icon="filter"
              onClick={toggleFilterList}
              style={{ marginRight: "10px" }}
            >
              {showFilterList ? `Optional Filters` : `Optional Filters`}
            </FilterButton>
          )}
        </div>
      )}
      {showRequiredFilters && requiredFilters.length > 0 && (
        <div
          className={cx(
            className,
            CS.flex,
            CS.alignEnd,
            CS.flexWrap,
            vertical ? CS.flexColumn : CS.flexRow,
            "required-filters",
          )}
        >
          {requiredFilters.map(parameter =>
            renderItem({ item: parameter, id: parameter.id }),
          )}
        </div>
      )}
      {showFilterList && optionalFilters.length > 0 && (
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
            items={optionalFilters}
            getId={getId}
            renderItem={renderItem}
            onSortEnd={handleSortEnd}
            sensors={[pointerSensor]}
          />
        </div>
      )}
    </>
  );
};
