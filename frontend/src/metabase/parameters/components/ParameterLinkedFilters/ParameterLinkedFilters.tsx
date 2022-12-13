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

const EMPTY_ARRAY: string[] = [];

export interface ParameterLinkedFiltersProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onChangeFilteringParameters: (
    parameterId: string,
    filteringParameters: string[],
  ) => void;
  onShowAddPopover: () => void;
}

const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onChangeFilteringParameters,
  onShowAddPopover,
}: ParameterLinkedFiltersProps): JSX.Element => {
  const parameterId = parameter.id;
  const filteringParameters = parameter.filteringParameters ?? EMPTY_ARRAY;

  const usableParameters = useMemo(
    () => otherParameters.filter(usableAsLinkedFilter),
    [otherParameters],
  );

  const handleFilterToggle = useCallback(
    (parameter: Parameter, isFiltered: boolean) => {
      const newFilteringParameters = isFiltered
        ? filteringParameters.concat(parameter.id)
        : filteringParameters.filter(id => id !== parameter.id);

      onChangeFilteringParameters(parameterId, newFilteringParameters);
    },
    [parameterId, filteringParameters, onChangeFilteringParameters],
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
              <SectionMessageLink key="link" onClick={onShowAddPopover}>
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
          {usableParameters.map(parameter => (
            <ParameterFilter
              key={parameter.id}
              parameter={parameter}
              isFiltered={filteringParameters.includes(parameter.id)}
              onFilterChange={handleFilterToggle}
            />
          ))}
        </div>
      )}
    </SectionRoot>
  );
};

interface ParameterFilterProps {
  parameter: Parameter;
  isFiltered: boolean;
  onFilterChange: (parameter: Parameter, isFiltered: boolean) => void;
}

const ParameterFilter = ({
  parameter,
  isFiltered,
  onFilterChange,
}: ParameterFilterProps): JSX.Element => {
  const handleFilterToggle = useCallback(
    (isFiltered: boolean) => {
      onFilterChange(parameter, isFiltered);
    },
    [parameter, onFilterChange],
  );

  return (
    <ParameterRoot>
      <ParameterBody>
        <ParameterName>{parameter.name}</ParameterName>
        <Toggle value={isFiltered} onChange={handleFilterToggle} />
      </ParameterBody>
    </ParameterRoot>
  );
};

export default ParameterLinkedFilters;
