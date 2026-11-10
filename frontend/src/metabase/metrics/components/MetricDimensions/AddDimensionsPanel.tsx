import { useState } from "react";
import { t } from "ttag";

import {
  useAddMetricDimensionsMutation,
  useListMetricDimensionsQuery,
} from "metabase/api/metric";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getDimensionIcon } from "metabase/common/utils/columns";
import { trackMetricDimensionAdded } from "metabase/metrics/analytics";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import {
  Accordion,
  Box,
  Button,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  AddableDimensionGroup,
  AddableMetricDimension,
  MetricDimension,
  MetricDimensionGroup,
  MetricId,
} from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { getNewDimensionTitle } from "./utils";

interface AddDimensionsPanelProps {
  metricId: MetricId;
  onDone: () => void;
}

/** Adds dimensions to a saved metric from the columns the server offers */
export function AddDimensionsPanel({
  metricId,
  onDone,
}: AddDimensionsPanelProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const dispatch = useDispatch();
  const { data, isLoading, error } = useListMetricDimensionsQuery({
    metricId,
    "with-addable": true,
    query: debouncedSearch || undefined,
    "include-orphaned": true,
  });
  const [addDimensions] = useAddMetricDimensionsMutation();

  const handleAdd = async (
    group: MetricDimensionGroup,
    dimension: AddableMetricDimension,
  ) => {
    try {
      await addDimensions({
        metricId,
        dimensions: [
          {
            ...dimension,
            display_name: getNewDimensionTitle(group, dimension),
          },
        ],
      }).unwrap();
      trackMetricDimensionAdded(metricId, dimension.id, "success");
    } catch {
      trackMetricDimensionAdded(metricId, dimension.id, "failure");
      dispatch(
        addUndo({
          message: t`Couldn't add ${dimension.display_name}`,
          variant: "negative",
        }),
      );
    }
  };

  return (
    <AddDimensionsPanelView
      groups={data?.addable ?? NO_GROUPS}
      isLoading={isLoading}
      error={error}
      search={search}
      isSearchActive={search.length > 0 || Boolean(debouncedSearch)}
      onSearchChange={setSearch}
      onAdd={handleAdd}
      onDone={onDone}
    />
  );
}

const NO_GROUPS: AddableDimensionGroup[] = [];

interface AddDimensionsPanelViewProps<
  TDimension extends MetricDimension = AddableMetricDimension,
> {
  groups: { group: MetricDimensionGroup; dimensions: TDimension[] }[];
  isLoading: boolean;
  error: unknown;
  search: string;
  isSearchActive: boolean;
  onSearchChange: (search: string) => void;
  onAdd: (group: MetricDimensionGroup, dimension: TDimension) => void;
  onDone: () => void;
}

/** The addable-dimension picker, independent of where dimensions are stored */
export function AddDimensionsPanelView<
  TDimension extends MetricDimension = AddableMetricDimension,
>({
  groups,
  isLoading,
  error,
  search,
  isSearchActive,
  onSearchChange,
  onAdd,
  onDone,
}: AddDimensionsPanelViewProps<TDimension>) {
  const groupIds = groups.map(({ group }) => group.id);
  const isEmpty = groups.length === 0;

  return (
    <Stack gap="lg" className={S.column} data-testid="add-dimensions-panel">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Title order={4}>{t`Add available dimensions`}</Title>
          <Text
            c="text-secondary"
            size="sm"
            mt="xxs"
          >{t`You can pick one or many.`}</Text>
        </Box>
        <Button variant="filled" onClick={onDone}>{t`Done`}</Button>
      </Group>

      {(!isEmpty || isSearchActive) && (
        <TextInput
          classNames={{ input: S.searchInput }}
          placeholder={t`Search…`}
          value={search}
          leftSection={<Icon name="search" />}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      )}

      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        {isEmpty ? (
          <EmptyState
            className={S.emptyState}
            message={
              isSearchActive
                ? t`No dimensions match your search.`
                : t`All available dimensions have been added`
            }
          />
        ) : (
          <ScrollArea
            classNames={{ viewport: S.scrollAreaViewport, root: S.scrollArea }}
          >
            <Accordion
              key={groupIds.join(",")}
              className={S.accordion}
              classNames={{
                item: S.item,
                control: S.control,
                label: S.label,
                chevron: S.chevron,
                content: S.content,
              }}
              multiple
              defaultValue={groupIds}
            >
              {groups.map(({ group, dimensions }) => (
                <Accordion.Item key={group.id} value={group.id}>
                  <Accordion.Control icon={<Icon name="table" />}>
                    {group.display_name}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {dimensions.map((dimension) => (
                        <UnstyledButton
                          key={dimension.id}
                          className={S.addableRow}
                          onClick={() => onAdd(group, dimension)}
                        >
                          <Group gap="sm" wrap="nowrap">
                            <Icon
                              name={getDimensionIcon(dimension)}
                              c="text-secondary"
                            />
                            <Text>{dimension.display_name}</Text>
                          </Group>
                        </UnstyledButton>
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          </ScrollArea>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
