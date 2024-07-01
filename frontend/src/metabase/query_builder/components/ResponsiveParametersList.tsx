/* eslint-disable react/prop-types */
import { useCallback, useState, useMemo } from "react";

import Button from "metabase/core/components/Button";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import type Question from "metabase-lib/v1/Question";
import type { Parameter, ParameterId } from "metabase-types/api";

import {
  FilterButton,
  ParametersListHeader,
  StyledParametersList,
  ResponsiveParametersListRoot,
  ParametersListContainer,
} from "./ResponsiveParametersList.styled";

interface ResponsiveParametersListProps {
  question: Question;
  parameters: Parameter[];
  setParameterValue: (parameterId: string, value: string) => void;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  setParameterIndex: (parameterId: string, parameterIndex: number) => void;
  enableParameterRequiredBehavior: boolean;
}

export const ResponsiveParametersList: React.FC<
  ResponsiveParametersListProps
> = ({
  question,
  parameters,
  setParameterValue,
  setParameterIndex,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
}) => {
  const [showParameterList, setShowParameterList] = useState<boolean>(false);
  const [showRequiredFilters, setShowRequiredFilters] = useState<boolean>(true);
  const isSmallScreen = useIsSmallScreen();

  const toggleVisibility = useCallback(
    (setState: React.Dispatch<React.SetStateAction<boolean>>) => {
      setState(show => !show);
    },
    [],
  );

  const handleFilterButtonClick = useCallback(() => {
    toggleVisibility(setShowParameterList);
  }, [toggleVisibility]);

  const handleCloseButtonClick = useCallback(() => {
    setShowParameterList(false);
  }, []);

  const handleToggleRequiredFilters = useCallback(() => {
    toggleVisibility(setShowRequiredFilters);
  }, [toggleVisibility]);

  const getButtonText = useCallback((count: number) => {
    return count.toString();
  }, []);

  const activeFilters = useMemo(() => {
    return parameters.filter(p => !!p.value).length;
  }, [parameters]);

  const requiredFilters = useMemo(() => {
    return parameters.filter(p => p.required).slice(0, 25);
  }, [parameters]);

  const activeRequiredFilters = useMemo(() => {
    return requiredFilters.filter(p => !!p.value).length;
  }, [requiredFilters]);

  return (
    <ResponsiveParametersListRoot
      isSmallScreen={isSmallScreen}
      isShowingMobile={showParameterList}
    >
      <div
        style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}
      >
        <FilterButton
          borderless
          primary
          tooltip="filters"
          icon="filter"
          onClick={handleFilterButtonClick}
        >
          {getButtonText(activeFilters)}
        </FilterButton>
        <FilterButton
          borderless
          primary
          tooltip="required filters"
          icon={showRequiredFilters ? "lock" : "chevron-down"}
          onClick={handleToggleRequiredFilters}
        >
          {getButtonText(activeRequiredFilters)}
        </FilterButton>
      </div>
      {showRequiredFilters && (
        <div style={{ marginBottom: "20px" }}>
          <StyledParametersList
            question={question}
            parameters={requiredFilters}
            setParameterValue={setParameterValue}
            setParameterIndex={setParameterIndex}
            setParameterValueToDefault={setParameterValueToDefault}
            enableParameterRequiredBehavior={enableParameterRequiredBehavior}
            isEditing
            commitImmediately
          />
        </div>
      )}
      {(isSmallScreen || showParameterList) && (
        <ParametersListContainer
          isSmallScreen={isSmallScreen}
          isShowingMobile={showParameterList}
        >
          {isSmallScreen && (
            <ParametersListHeader>
              <h3>Filters</h3>
              <Button
                onlyIcon
                borderless
                icon="close"
                onClick={handleCloseButtonClick}
              />
            </ParametersListHeader>
          )}
          <StyledParametersList
            question={question}
            parameters={parameters}
            setParameterValue={setParameterValue}
            setParameterIndex={setParameterIndex}
            setParameterValueToDefault={setParameterValueToDefault}
            enableParameterRequiredBehavior={enableParameterRequiredBehavior}
            isEditing
            commitImmediately
          />
        </ParametersListContainer>
      )}
    </ResponsiveParametersListRoot>
  );
};
