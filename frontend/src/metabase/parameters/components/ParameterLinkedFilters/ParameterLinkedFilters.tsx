import { Fragment, useCallback, useMemo, useState } from "react";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetFieldQuery,
  useGetValidDashboardFilterFieldsQuery,
} from "metabase/api";
import ExternalLink from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDocsUrl, useLearnUrl } from "metabase/common/hooks";
import { showAddParameterPopover } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import {
  Box,
  Button,
  Group,
  HoverCard,
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

type ContentProps = {
  parameter: UiParameter;
  usableParameters: UiParameter[];
  onChangeFilteringParameters: (filteringParameters: ParameterId[]) => void;
};

function Content({
  parameter,
  usableParameters,
  onChangeFilteringParameters,
}: ContentProps) {
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

  if (isLoading) {
    return <Skeleton height="2.5rem" />;
  }

  if (error != null) {
    return <LoadingAndErrorWrapper error={error} />;
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
    <Stack gap="md">
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
    </Stack>
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
    <Stack gap="md">
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
    </Stack>
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
      <Text>
        {jt`If you toggle on one of these dashboard filters, selecting a value for that filter will limit the available choices for ${(
          <Box key="text" component="strong">{t`this`}</Box>
        )} filter.`}
      </Text>
      {compatibleParameters.length > 0 && (
        <Stack gap="md" data-testid="compatible-parameters">
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
      )}
      {incompatibleParameters.length > 0 && (
        <Stack gap="md" data-testid="incompatible-parameters">
          <Group gap="sm">
            <Text c="text-secondary" fw="bold">{t`Incompatible filters`}</Text>
            <ParameterHelpInfo />
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

function ParameterHelpInfo() {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "dashboards/linked-filters",
    { anchor: "set-up-tables-for-linked-filters" },
  );

  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon c="text-secondary" name="info" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack p="md" maw="20rem">
          <Text>
            {t`There needs to be a foreign-key relationship between the fields connected to these filters.`}
          </Text>
          {showMetabaseLinks && (
            <ExternalLink href={docsUrl} target="_blank">
              {t`Learn more`}
            </ExternalLink>
          )}
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
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
    <Box className={S.parameterItem} bg="background-secondary">
      <Group justify="space-between" align="center" pr="md">
        <Button
          c={isCompatible ? "text-primary" : undefined}
          variant="subtle"
          rightSection={isCompatible && <Icon name="chevrondown" aria-hidden />}
          disabled={!isCompatible}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {parameter.name}
        </Button>
        {isCompatible && (
          <Switch
            size="sm"
            role="switch"
            checked={isFiltered}
            onChange={(event) =>
              onFilterChange(parameter, event.target.checked)
            }
          />
        )}
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
  const { data: field, isLoading, error } = useGetFieldQuery({ id: fieldId });

  if (error != null) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (!field || isLoading) {
    return <Skeleton height="1.8125rem" />;
  }

  return (
    <Box>
      {field.table && <Box c="text-secondary">{field.table.display_name}</Box>}
      <Box>{field.display_name}</Box>
    </Box>
  );
};
