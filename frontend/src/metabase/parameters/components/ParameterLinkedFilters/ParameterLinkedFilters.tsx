import type { ChangeEventHandler } from "react";
import { Fragment, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetFieldQuery,
  useGetValidDashboardFilterFieldsQuery,
} from "metabase/api";
import { useLearnUrl } from "metabase/common/hooks";
import { LoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import { showAddParameterPopover } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Box, Switch } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { FieldId, ParameterId } from "metabase-types/api";

import { usableAsLinkedFilter } from "../../utils/linked-filters";

import {
  FieldLabel,
  FieldListHeader,
  FieldListItem,
  FieldListRoot,
  FieldListTitle,
  FieldRoot,
  ParameterBody,
  ParameterName,
  ParameterRoot,
  SectionHeader,
  SectionMessage,
  SectionMessageLink,
} from "./ParameterLinkedFiltersComponents";
import {
  type LinkedParameterInfo,
  getFilterFieldsRequest,
  getLinkedParametersInfo,
} from "./utils";

export interface ParameterLinkedFiltersProps {
  parameter: UiParameter;
  otherParameters: UiParameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
}

export const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onChangeFilteringParameters,
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
      />
    </Box>
  );
};

function Content({
  parameter,
  usableParameters,
  onChangeFilteringParameters,
}: {
  parameter: UiParameter;
  usableParameters: UiParameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
}) {
  const {
    data: filteringIdsByFilteredId = {},
    isLoading,
    error,
  } = useGetValidDashboardFilterFieldsQuery(
    getFilterFieldsRequest(parameter, usableParameters) ?? skipToken,
  );
  const linkedParametersInfo = getLinkedParametersInfo(
    usableParameters,
    filteringIdsByFilteredId,
  );

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (usableParameters.length === 0) {
    return <NoUsableParameters />;
  }

  if (parameter.values_source_type != null) {
    return <ParametersFromOtherSource />;
  }

  if (parameter.values_query_type === "none") {
    return <ParameterIsInputBoxType />;
  }

  return (
    <LinkedParameterList
      parameter={parameter}
      linkedParametersInfo={linkedParametersInfo}
      onChangeFilteringParameters={onChangeFilteringParameters}
    />
  );
}

function NoUsableParameters(): JSX.Element {
  const dispatch = useDispatch();
  const onShowAddParameterPopover = () => {
    dispatch(showAddParameterPopover());
  };

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
  const { url: docsUrl, showMetabaseLinks } = useLearnUrl(
    "metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters",
  );

  return (
    <div>
      <SectionMessage>
        {t`If the filter has values that are from another question or model, or a custom list, then this filter can't be limited by another dashboard filter.`}
      </SectionMessage>
      {showMetabaseLinks && (
        <SectionMessage>
          {jt`For Native Questions use ${(
            <ExternalLink key="field-filters" role="link" href={docsUrl}>
              {t`Field Filters`}
            </ExternalLink>
          )} to make Linked Filters available here.`}
        </SectionMessage>
      )}
    </div>
  );
}

function LinkedParameterList({
  parameter,
  linkedParametersInfo,
  onChangeFilteringParameters,
}: {
  parameter: UiParameter;
  linkedParametersInfo: LinkedParameterInfo[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
}): JSX.Element {
  const [expandedParameterId, setExpandedParameterId] = useState<ParameterId>();

  const handleFilterChange = useCallback(
    (linkedParameter: UiParameter, isFiltered: boolean) => {
      const newParameters = isFiltered
        ? (parameter.filteringParameters ?? []).concat(linkedParameter.id)
        : (parameter.filteringParameters ?? []).filter(
            (id) => id !== linkedParameter.id,
          );

      onChangeFilteringParameters(newParameters);
    },
    [parameter.filteringParameters, onChangeFilteringParameters],
  );

  const handleExpandedChange = useCallback(
    (linkedParameter: UiParameter, isExpanded: boolean) => {
      setExpandedParameterId(isExpanded ? linkedParameter.id : undefined);
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
      {linkedParametersInfo.map(
        ({ parameter: linkedParameter, filteredIds, filteringIds }) => (
          <LinkedParameter
            key={parameter.id}
            linkedParameter={linkedParameter}
            filteredIds={filteredIds}
            filteringIds={filteringIds}
            isFiltered={
              !!parameter.filteringParameters?.includes(linkedParameter.id)
            }
            isExpanded={linkedParameter.id === expandedParameterId}
            onFilterChange={handleFilterChange}
            onExpandedChange={handleExpandedChange}
          />
        ),
      )}
    </div>
  );
}

interface LinkedParameterProps {
  linkedParameter: UiParameter;
  filteredIds: FieldId[];
  filteringIds: FieldId[];
  isFiltered: boolean;
  isExpanded: boolean;
  onFilterChange: (linkedParameter: UiParameter, isFiltered: boolean) => void;
  onExpandedChange: (linkedParameter: UiParameter, isExpanded: boolean) => void;
}

const LinkedParameter = ({
  linkedParameter,
  filteredIds,
  filteringIds,
  isFiltered,
  isExpanded,
  onFilterChange,
  onExpandedChange,
}: LinkedParameterProps): JSX.Element => {
  const handleFilterToggle: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange(linkedParameter, e.target.checked);
    },
    [linkedParameter, onFilterChange],
  );

  const handleExpandedChange = useCallback(() => {
    onExpandedChange(linkedParameter, !isExpanded);
  }, [isExpanded, linkedParameter, onExpandedChange]);

  return (
    <ParameterRoot>
      <ParameterBody>
        <ParameterName onClick={handleExpandedChange}>
          {linkedParameter.name}
        </ParameterName>
        <Switch
          role="switch"
          checked={isFiltered}
          onChange={handleFilterToggle}
        />
      </ParameterBody>
      {isExpanded && (
        <LinkedFieldList
          filteredIds={filteredIds}
          filteringIds={filteringIds}
        />
      )}
    </ParameterRoot>
  );
};

interface LinkedFieldListProps {
  filteredIds: FieldId[];
  filteringIds: FieldId[];
}

const LinkedFieldList = ({
  filteredIds,
  filteringIds,
}: LinkedFieldListProps) => {
  return (
    <FieldListRoot>
      <FieldListHeader>
        <FieldListTitle>{t`Filtering column`}</FieldListTitle>
        <FieldListTitle>{t`Filtered column`}</FieldListTitle>
      </FieldListHeader>
      {filteringIds.map((filteringId) => (
        <Fragment key={filteringId}>
          {filteredIds.map((filteredId) => (
            <FieldListItem key={filteredId}>
              <LinkedField fieldId={filteringId} />
              <LinkedField fieldId={filteredId} />
            </FieldListItem>
          ))}
        </Fragment>
      ))}
    </FieldListRoot>
  );
};

interface LinkedFieldProps {
  fieldId: FieldId;
}

const LinkedField = ({ fieldId }: LinkedFieldProps) => {
  const { data: field, isLoading, error } = useGetFieldQuery({ id: fieldId });
  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <FieldRoot>
      <FieldLabel>
        {field?.table && <span>{field.table.display_name}</span>}
      </FieldLabel>
      {field && <div>{field.display_name}</div>}
    </FieldRoot>
  );
};
