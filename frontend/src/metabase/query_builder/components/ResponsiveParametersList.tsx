/* eslint-disable react/prop-types */
import { useState, useMemo } from "react";

import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import type Question from "metabase-lib/v1/Question";
import type { Parameter, ParameterId } from "metabase-types/api";

import {
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
  const [showParameterList] = useState<boolean>(true);
  const [showRequiredFilters] = useState<boolean>(false);
  const isSmallScreen = useIsSmallScreen();

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

      {showRequiredFilters && activeFilters > 0 && (
        <hr style={{ border: "1px solid #ccc", margin: "20px 0" }} />
      )}

      {(isSmallScreen || showParameterList) && (
        <ParametersListContainer
          isSmallScreen={isSmallScreen}
          isShowingMobile={showParameterList}
        >
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
