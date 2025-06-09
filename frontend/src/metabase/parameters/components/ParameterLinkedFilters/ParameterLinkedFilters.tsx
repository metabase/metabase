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
import {
  Box,
  Button,
  Group,
  Icon,
  SimpleGrid,
  Skeleton,
  Stack,
  Switch,
  Text,
} from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { FieldId, ParameterId } from "metabase-types/api";

import { usableAsLinkedFilter } from "../../utils/linked-filters";

import S from "./ParameterLinkedFilters.module.css";
import type { ParameterInfo } from "./types";
import { getFilterFieldsRequest, getParametersInfo } from "./utils";

export interface ParameterLinkedFiltersProps {
  parameter: UiParameter;
  otherParameters: UiParameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
}

export const ParameterLinkedFilters = ({
  parameter,
  otherParameters,
  onChangeFilteringParameters,
}: ParameterLinkedFiltersProps) => {
  const usableParameters = useMemo(
    () => otherParameters.filter(usableAsLinkedFilter),
    [otherParameters],
  );

  return (
    <Box p="1.5rem 1rem">
      <Text fw="bold" mb="sm">{t`Limit this filter's choices`}</Text>
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
  const otherParameters = getParametersInfo(
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
    <ParameterList
      parameter={parameter}
      otherParameters={otherParameters}
      onChangeFilteringParameters={onChangeFilteringParameters}
    />
  );
}

function NoUsableParameters() {
  const dispatch = useDispatch();
  const onShowAddParameterPopover = () => {
    dispatch(showAddParameterPopover());
  };

  return (
    <div>
      <Text>
        {t`If you have another dashboard filter, you can limit the choices that are listed for this filter based on the selection of the other one.`}
      </Text>
      <Text>
        {jt`So first, ${(
          <Box
            className={S.buttonLink}
            key="link"
            component="span"
            c="brand"
            role="button"
            onClick={onShowAddParameterPopover}
          >
            {t`add another dashboard filter`}
          </Box>
        )}.`}
      </Text>
    </div>
  );
}

function ParameterIsInputBoxType() {
  return (
    <Text>
      {t`This filter can't be limited by another dashboard filter because its widget type is an input box.`}
    </Text>
  );
}

function ParametersFromOtherSource() {
  const { url: docsUrl, showMetabaseLinks } = useLearnUrl(
    "metabase-basics/querying-and-dashboards/sql-in-metabase/field-filters",
  );

  return (
    <div>
      <Text>
        {t`If the filter has values that are from another question or model, or a custom list, then this filter can't be limited by another dashboard filter.`}
      </Text>
      {showMetabaseLinks && (
        <Text>
          {jt`For Native Questions use ${(
            <ExternalLink key="field-filters" role="link" href={docsUrl}>
              {t`Field Filters`}
            </ExternalLink>
          )} to make Linked Filters available here.`}
        </Text>
      )}
    </div>
  );
}

type ParameterListProps = {
  parameter: UiParameter;
  otherParameters: ParameterInfo[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
};

function ParameterList({
  parameter,
  otherParameters,
  onChangeFilteringParameters,
}: ParameterListProps) {
  const compatibleParameters = otherParameters.filter(
    ({ isCompatible }) => isCompatible,
  );
  const incompatibleParameters = otherParameters.filter(
    ({ isCompatible }) => !isCompatible,
  );

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

  return (
    <Stack gap="lg">
      <Text lh="1.25rem">
        {jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
          <em key="text">{t`this`}</em>
        )} filter.`}
      </Text>
      <Stack gap="md">
        {compatibleParameters.map(
          ({ parameter: otherParameter, filteredIds, filteringIds }) => (
            <ParameterItem
              key={otherParameter.id}
              parameter={otherParameter}
              filteredIds={filteredIds}
              filteringIds={filteringIds}
              isFiltered={
                parameter.filteringParameters != null &&
                parameter.filteringParameters.includes(otherParameter.id)
              }
              isCompatible={true}
              onFilterChange={handleFilterChange}
            />
          ),
        )}
      </Stack>
      {incompatibleParameters.length > 0 && (
        <Stack gap="md">
          <Group gap="sm">
            <Text c="text-secondary" fw="bold">{t`Incompatible filters`}</Text>
            <Icon c="text-secondary" name="info_filled" />
          </Group>
          {incompatibleParameters.map(
            ({ parameter: otherParameter, filteredIds, filteringIds }) => (
              <ParameterItem
                key={otherParameter.id}
                parameter={otherParameter}
                filteredIds={filteredIds}
                filteringIds={filteringIds}
                isFiltered={false}
                isCompatible={false}
                onFilterChange={handleFilterChange}
              />
            ),
          )}
        </Stack>
      )}
    </Stack>
  );
}

type ParameterItemProps = {
  parameter: UiParameter;
  filteredIds: FieldId[];
  filteringIds: FieldId[];
  isFiltered: boolean;
  isCompatible: boolean;
  onFilterChange: (parameter: UiParameter, isFiltered: boolean) => void;
};

const ParameterItem = ({
  parameter,
  filteredIds,
  filteringIds,
  isFiltered,
  isCompatible,
  onFilterChange,
}: ParameterItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Box className={S.parameterItem} bg="bg-light">
      <Group justify="space-between" align="center" pr="md">
        <Button
          c="text-secondary"
          variant="subtle"
          rightSection={isCompatible && <Icon name="chevrondown" />}
          disabled={!isCompatible}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {parameter.name}
        </Button>
        <Switch
          size="sm"
          role="switch"
          checked={isFiltered}
          disabled={!isCompatible}
          onChange={(event) => onFilterChange(parameter, event.target.checked)}
        />
      </Group>
      {isExpanded && (
        <FieldList filteredIds={filteredIds} filteringIds={filteringIds} />
      )}
    </Box>
  );
};

type FieldListProps = {
  filteredIds: FieldId[];
  filteringIds: FieldId[];
};

const FieldList = ({ filteredIds, filteringIds }: FieldListProps) => {
  return (
    <SimpleGrid cols={2} px="md" pb="md" spacing="sm" fz="sm">
      <Box c="brand">{t`Filtering column`}</Box>
      <Box c="brand">{t`Filtered column`}</Box>
      {filteringIds.map((filteringId) => (
        <Fragment key={filteringId}>
          {filteredIds.map((filteredId) => (
            <Fragment key={filteredId}>
              <FieldItem fieldId={filteringId} />
              <FieldItem fieldId={filteredId} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </SimpleGrid>
  );
};

type FieldItemProps = {
  fieldId: FieldId;
};

const FieldItem = ({ fieldId }: FieldItemProps) => {
  const { data: field, isLoading } = useGetFieldQuery({ id: fieldId });
  if (!field || isLoading) {
    return <Skeleton height="3rem" />;
  }

  return (
    <Box>
      {field.table && <Box c="text-secondary">{field.table.display_name}</Box>}
      <Box>{field.display_name}</Box>
    </Box>
  );
};
