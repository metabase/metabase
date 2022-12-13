import React, { useCallback, useMemo } from "react";
import { jt, t } from "ttag";
import Toggle from "metabase/core/components/Toggle";
import { Parameter } from "metabase-types/api";
import { usableAsLinkedFilter } from "../../utils/linked-filters";
import {
  SectionRoot,
  SectionHeader,
  SectionMessage,
  SectionMessageLink,
  ParameterRoot,
  ParameterBody,
  ParameterName,
} from "./ParameterLinkedFilters.styled";

export interface ParameterLinkedFiltersProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onChangeParameter: (parameter: Parameter) => void;
  onShowAddParameterPopover: () => void;
}

const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onChangeParameter,
  onShowAddParameterPopover,
}: ParameterLinkedFiltersProps): JSX.Element => {
  const usableParameters = useMemo(
    () => otherParameters.filter(usableAsLinkedFilter),
    [otherParameters],
  );

  const handleFilterToggle = useCallback(
    (otherParameter: Parameter, isFiltered: boolean) => {
      const oldParameters = parameter.filteringParameters ?? [];
      const newParameters = isFiltered
        ? oldParameters.concat(otherParameter.id)
        : oldParameters.filter(id => id !== otherParameter.id);

      onChangeParameter({
        ...parameter,
        filteringParameters: newParameters,
      });
    },
    [parameter, onChangeParameter],
  );

  return (
    <SectionRoot>
      <SectionHeader>{t`Limit this filter's choices`}</SectionHeader>
      {usableParameters.length === 0 ? (
        <div>
          <SectionMessage>
            {t`If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.`}
          </SectionMessage>
          <SectionMessage>
            {jt`So first, ${(
              <SectionMessageLink
                key="link"
                onClick={onShowAddParameterPopover}
              >
                {t`add another dashboard filter`}
              </SectionMessageLink>
            )}.`}
          </SectionMessage>
        </div>
      ) : (
        <div>
          <SectionMessage>
            {jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
              <em key="text">{t`this`}</em>
            )} filter.`}
          </SectionMessage>
          {usableParameters.map(otherParameter => (
            <LinkedParameter
              key={otherParameter.id}
              otherParameter={otherParameter}
              isFiltered={parameter.filteringParameters?.includes(parameter.id)}
              onFilterChange={handleFilterToggle}
            />
          ))}
        </div>
      )}
    </SectionRoot>
  );
};

interface LinkedParameterProps {
  otherParameter: Parameter;
  isFiltered?: boolean;
  onFilterChange: (otherParameter: Parameter, isFiltered: boolean) => void;
}

const LinkedParameter = ({
  otherParameter,
  isFiltered,
  onFilterChange,
}: LinkedParameterProps): JSX.Element => {
  const handleFilterToggle = useCallback(
    (isFiltered: boolean) => {
      onFilterChange(otherParameter, isFiltered);
    },
    [otherParameter, onFilterChange],
  );

  return (
    <ParameterRoot>
      <ParameterBody>
        <ParameterName>{otherParameter.name}</ParameterName>
        <Toggle value={isFiltered} onChange={handleFilterToggle} />
      </ParameterBody>
    </ParameterRoot>
  );
};

export default ParameterLinkedFilters;
