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
  isNativeEditorOpen: boolean;
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
  const [nativeEditorOpen, setNativeEditorOpen] = useState(false);
  const isSmallScreen = useIsSmallScreen();

  const handleFilterButtonClick = useCallback(() => {
    setShowMobileParameterList(mobileShow => !mobileShow);
    setNativeEditorOpen(isNativeEditorOpen => !isNativeEditorOpen);
  }, []);

  const activeFilters = useMemo(() => {
    return parameters.filter(p => !!p.value).length;
  }, [parameters]);

  return (
    <ResponsiveParametersListRoot
      isSmallScreen={isSmallScreen}
      isShowingMobile={mobileShowParameterList}
      isNativeEditorOpen={nativeEditorOpen}
    >
      <StyledParametersList
        question={question}
        parameters={parameters.filter(x => x.required === true)}
        setParameterValue={setParameterValue}
        setParameterIndex={setParameterIndex}
        setParameterValueToDefault={setParameterValueToDefault}
        enableParameterRequiredBehavior={enableParameterRequiredBehavior}
        isEditing
        commitImmediately
      />
      <FilterButton
        borderless
        primary
        icon="filter"
        onClick={handleFilterButtonClick}
      >
        {activeFilters > 0
          ? ngettext(
              msgid`All Filters (${activeFilters} active)`,
              `All Filters (${activeFilters} active)`,
              activeFilters,
            )
          : `Filters`}
      </FilterButton>
      <ParametersListContainer
        isSmallScreen={isSmallScreen}
        isShowingMobile={mobileShowParameterList}
        isNativeEditorOpen={nativeEditorOpen}
      >
        <ParametersListHeader>
          <h3>Filters</h3>
          <Button
            onlyIcon
            borderless
            icon="close"
            onClick={handleFilterButtonClick}
          />
        </ParametersListHeader>
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
