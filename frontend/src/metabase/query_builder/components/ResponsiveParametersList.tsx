import { useCallback, useState, useMemo } from "react";
import { msgid, ngettext } from "ttag";

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

export const ResponsiveParametersList = ({
  question,
  parameters,
  setParameterValue,
  setParameterIndex,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
}: ResponsiveParametersListProps) => {
  const [showParameterList, setShowParameterList] = useState(false);
  const [showRequiredFilters, setShowRequiredFilters] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleFilterButtonClick = useCallback(() => {
    setShowParameterList(show => !show);
  }, []);

  const handleCloseButtonClick = useCallback(() => {
    setShowParameterList(false);
  }, []);

  const handleToggleRequiredFilters = useCallback(() => {
    setShowRequiredFilters(show => !show);
  }, []);

  const activeFilters = useMemo(() => {
    return parameters.filter(p => !!p.value).length;
  }, [parameters]);

  const requiredFilters = useMemo(() => {
    return parameters.filter(p => p.required).slice(0, 25);
  }, [parameters]);

  return (
    <ResponsiveParametersListRoot
      isSmallScreen={isSmallScreen}
      isShowingMobile={showParameterList}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <FilterButton
          borderless
          primary
          icon="filter"
          onClick={handleFilterButtonClick}
        >
          {activeFilters > 0
            ? ngettext(
                msgid`${activeFilters} active filter`,
                `${activeFilters} active filters`,
                activeFilters,
              )
            : `Filters`}
        </FilterButton>
        <Button
          borderless
          primary
          icon={showRequiredFilters ? "chevronup" : "chevrondown"}
          onClick={handleToggleRequiredFilters}
        >
          {showRequiredFilters
            ? "Hide Required Filters"
            : "Show Required Filters"}
        </Button>
      </div>
      {showRequiredFilters && (
        <div>
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
