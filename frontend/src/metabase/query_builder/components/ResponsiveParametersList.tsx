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
  const [mobileShowParameterList, setShowMobileParameterList] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleFilterButtonClick = useCallback(() => {
    setShowMobileParameterList(mobileShow => !mobileShow);
  }, []);

  const activeFilters = useMemo(() => {
    return parameters.filter(p => !!p.value).length;
  }, [parameters]);

  return (
    <ResponsiveParametersListRoot
      isSmallScreen={isSmallScreen}
      isShowingMobile={mobileShowParameterList}
    >
      {isSmallScreen && (
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
      )}
      <ParametersListContainer
        isSmallScreen={isSmallScreen}
        isShowingMobile={mobileShowParameterList}
      >
        {isSmallScreen && (
          <ParametersListHeader>
            <h3>Filters</h3>
            <Button
              onlyIcon
              borderless
              icon="close"
              onClick={handleFilterButtonClick}
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
    </ResponsiveParametersListRoot>
  );
};
