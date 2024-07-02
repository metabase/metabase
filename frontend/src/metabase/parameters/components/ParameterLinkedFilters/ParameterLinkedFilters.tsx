import type { ChangeEventHandler } from "react";
import { useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Fields from "metabase/entities/fields";
import Tables from "metabase/entities/tables";
import { Box, Switch } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { FieldId, Parameter, ParameterId } from "metabase-types/api";

import { usableAsLinkedFilter } from "../../utils/linked-filters";

import {
  SectionHeader,
  SectionMessage,
  SectionMessageLink,
  ParameterRoot,
  ParameterBody,
  ParameterName,
  FieldRoot,
  FieldLabel,
  FieldListRoot,
  FieldListItem,
  FieldListHeader,
  FieldListTitle,
} from "./ParameterLinkedFilters.styled";
import useFilterFields from "./use-filter-fields";

export interface ParameterLinkedFiltersProps {
  parameter: Parameter;
  otherParameters: Parameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
  onShowAddParameterPopover: () => void;
}

export const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onChangeFilteringParameters,
  onShowAddParameterPopover,
}: ParameterLinkedFiltersProps): JSX.Element => {
  const usableParameters = useMemo(
    () => otherParameters.filter(usableAsLinkedFilter),
    [otherParameters],
  );

  return (
    <Box p="1.5rem 1rem">
      <SectionHeader>{t`Limit this filter's choices`}</SectionHeader>
      <Content
        usableParameters={usableParameters}
        parameter={parameter}
        onChangeFilteringParameters={onChangeFilteringParameters}
        onShowAddParameterPopover={onShowAddParameterPopover}
      />
    </Box>
  );
};

function Content({
  usableParameters,
  parameter,
  onChangeFilteringParameters,
  onShowAddParameterPopover,
}: {
  usableParameters: Parameter[];
  parameter: Parameter;
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
  onShowAddParameterPopover: () => void;
}) {
  if (usableParameters.length === 0) {
    return (
      <NoUsableParameters
        onShowAddParameterPopover={onShowAddParameterPopover}
      />
    );
  }
  if (parameter.values_source_type != null) {
    return <ParametersFromOtherSource />;
  }
  if (parameter.values_query_type === "none") {
    return <ParameterIsInputBoxType />;
  }
  return (
    <UsableParameters
      parameter={parameter}
      usableParameters={usableParameters}
      onChangeFilteringParameters={onChangeFilteringParameters}
    />
  );
}

function NoUsableParameters({
  onShowAddParameterPopover,
}: {
  onShowAddParameterPopover: () => void;
}): JSX.Element {
  return (
    <div>
      <SectionMessage>
        {t`If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.`}
      </SectionMessage>
      <SectionMessage>
        {jt`So first, ${(
          <SectionMessageLink key="link" onClick={onShowAddParameterPopover}>
            {t`add another dashboard filter`}
          </SectionMessageLink>
        )}.`}
      </SectionMessage>
    </div>
  );
}

function ParameterIsInputBoxType(): JSX.Element {
  return (
    <SectionMessage>
      {t`This filter can't be limited by another dashboard filter because its widget type is an input box.`}
    </SectionMessage>
  );
}

function ParametersFromOtherSource(): JSX.Element {
  return (
    <div>
      <SectionMessage>
        {t`If the filter has values that are from another question or model, or a custom list, then this filter can't be limited by another dashboard filter.`}
      </SectionMessage>
    </div>
  );
}

function UsableParameters({
  parameter,
  usableParameters,
  onChangeFilteringParameters,
}: {
  parameter: Parameter;
  usableParameters: Parameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
}): JSX.Element {
  const [expandedParameterId, setExpandedParameterId] = useState<ParameterId>();

  const handleFilterChange = useCallback(
    (otherParameter: Parameter, isFiltered: boolean) => {
      const newParameters = isFiltered
        ? (parameter.filteringParameters ?? []).concat(otherParameter.id)
        : (parameter.filteringParameters ?? []).filter(
            id => id !== otherParameter.id,
          );

      onChangeFilteringParameters(newParameters);
    },
    [parameter.filteringParameters, onChangeFilteringParameters],
  );

  const handleExpandedChange = useCallback(
    (otherParameter: Parameter, isExpanded: boolean) => {
      setExpandedParameterId(isExpanded ? otherParameter.id : undefined);
    },
    [],
  );

  return (
    <div>
      <SectionMessage>
        {jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
          <em key="text">{t`this`}</em>
        )} filter.`}
      </SectionMessage>
      {usableParameters.map(otherParameter => (
        <LinkedParameter
          key={otherParameter.id}
          parameter={parameter}
          otherParameter={otherParameter}
          isFiltered={
            !!parameter.filteringParameters?.includes(otherParameter.id)
          }
          isExpanded={otherParameter.id === expandedParameterId}
          onFilterChange={handleFilterChange}
          onExpandedChange={handleExpandedChange}
        />
      ))}
    </div>
  );
}

interface LinkedParameterProps {
  parameter: Parameter;
  otherParameter: Parameter;
  isFiltered: boolean;
  isExpanded: boolean;
  onFilterChange: (otherParameter: Parameter, isFiltered: boolean) => void;
  onExpandedChange: (otherParameter: Parameter, isExpanded: boolean) => void;
}

const LinkedParameter = ({
  parameter,
  otherParameter,
  isFiltered,
  isExpanded,
  onFilterChange,
  onExpandedChange,
}: LinkedParameterProps): JSX.Element => {
  const handleFilterToggle: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange(otherParameter, e.target.checked);
    },
    [otherParameter, onFilterChange],
  );

  const handleExpandedChange = useCallback(() => {
    onExpandedChange(otherParameter, !isExpanded);
  }, [isExpanded, otherParameter, onExpandedChange]);

  return (
    <ParameterRoot>
      <ParameterBody>
        <ParameterName onClick={handleExpandedChange}>
          {otherParameter.name}
        </ParameterName>
        <Switch
          role="switch"
          checked={isFiltered}
          onChange={handleFilterToggle}
        />
      </ParameterBody>
      {isExpanded && (
        <LinkedFieldList
          parameter={parameter}
          otherParameter={otherParameter}
        />
      )}
    </ParameterRoot>
  );
};

interface LinkedFieldListProps {
  parameter: Parameter;
  otherParameter: Parameter;
}

const LinkedFieldList = ({
  parameter,
  otherParameter,
}: LinkedFieldListProps) => {
  const { data, error, loading } = useFilterFields(parameter, otherParameter);

  return (
    <LoadingAndErrorWrapper loading={loading} error={error}>
      <FieldListRoot>
        {data && data.length > 0 && (
          <FieldListHeader>
            <FieldListTitle>{t`Filtering column`}</FieldListTitle>
            <FieldListTitle>{t`Filtered column`}</FieldListTitle>
          </FieldListHeader>
        )}
        {data?.map(([filteringId, filteredId]) => (
          <FieldListItem key={filteredId}>
            <LinkedField fieldId={filteringId} />
            <LinkedField fieldId={filteredId} />
          </FieldListItem>
        ))}
      </FieldListRoot>
    </LoadingAndErrorWrapper>
  );
};

interface LinkedFieldProps {
  fieldId: FieldId;
}

const LinkedField = ({ fieldId }: LinkedFieldProps) => {
  return (
    <Fields.Loader id={fieldId}>
      {({ field }: { field: Field }) => (
        <FieldRoot>
          <FieldLabel>
            <Tables.Loader id={field.table_id}>
              {({ table }: { table: Table }) => (
                <span>{table.display_name}</span>
              )}
            </Tables.Loader>
          </FieldLabel>
          <div>{field.display_name}</div>
        </FieldRoot>
      )}
    </Fields.Loader>
  );
};
