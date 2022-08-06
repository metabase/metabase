import React, { useCallback, useState, useMemo } from "react";

import useIsSmallScreen from "metabase/hooks/use-is-small-screen";

import Button from "metabase/core/components/Button";

import {
  FilterButton,
  ParametersListHeader,
  StyledParametersList,
  ResponsiveParametersListRoot,
  ParametersListContainer,
} from "./ResponsiveParametersList.styled";

interface ResponsiveParametersListProps {
  parameters: any;
  setParameterValue: any;
  setParameterIndex: any;
}

export const ResponsiveParametersList = ({
  parameters,
  setParameterValue,
  setParameterIndex,
}: ResponsiveParametersListProps) => {
  const [mobileShowParameterList, setShowMobileParameterList] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleFilterButtonClick = useCallback(() => {
    setShowMobileParameterList(!mobileShowParameterList);
  }, [mobileShowParameterList]);

  const activeFilters = useMemo(() => {
    return parameters.filter(p => !!p.value).length;
  }, [parameters]);

  return (
    <ResponsiveParametersListRoot isSmallScreen={isSmallScreen}>
      {isSmallScreen && (
        <FilterButton
          borderless
          primary
          icon="filter"
          onClick={handleFilterButtonClick}
        >
          {activeFilters > 0 ? `${activeFilters} active filters` : `Filters`}
        </FilterButton>
      )}
      {/* {isSmallScreen && mobileShowParameterList && (
        <ParametersListHeader>
          <h3>Filters</h3>
          <Button
            onlyIcon
            borderless
            icon="close"
            onClick={handleFilterButtonClick}
            iconSize={14}
          />
        </ParametersListHeader>
      )} */}
      {(!isSmallScreen || mobileShowParameterList) && (
        <ParametersListContainer isSmallScreen={isSmallScreen}>
          {isSmallScreen && (
            <ParametersListHeader>
              <h3>Filters</h3>
              <Button
                onlyIcon
                borderless
                icon="close"
                onClick={handleFilterButtonClick}
                iconSize={14}
              />
            </ParametersListHeader>
          )}
          <StyledParametersList
            parameters={parameters}
            setParameterValue={setParameterValue}
            setParameterIndex={setParameterIndex}
            isEditing
            commitImmediately
          />
        </ParametersListContainer>
      )}
    </ResponsiveParametersListRoot>
  );
};
