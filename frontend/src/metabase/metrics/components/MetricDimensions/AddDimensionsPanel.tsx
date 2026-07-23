import { useState } from "react";
import { t } from "ttag";

import {
  useAddMetricDimensionsMutation,
  useListMetricDimensionsQuery,
} from "metabase/api/metric";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getDimensionIcon } from "metabase/common/metrics/utils/dimensions";
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
  });
  const [addDimensions] = useAddMetricDimensionsMutation();

  const groups = data?.addable ?? [];
  const groupIds = groups.map(({ group }) => group.id);
  const isSearchActive = search.length > 0 || Boolean(debouncedSearch);
  const isEmpty = groups.length === 0;

  const handleAdd = async (
    group: MetricDimensionGroup,
    dimension: MetricDimension,
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
    } catch {
      dispatch(addUndo({ message: t`Couldn't add ${dimension.display_name}` }));
    }
  };

  return (
    <Stack gap="md" className={S.column} data-testid="add-dimensions-panel">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Title order={4}>{t`Add available dimensions`}</Title>
          <Text
            c="text-secondary"
            size="sm"
            mt="xs"
          >{t`You can pick one or many.`}</Text>
        </Box>
        <Button variant="filled" onClick={onDone} size="sm">{t`Done`}</Button>
      </Group>

      {(!isEmpty || isSearchActive) && (
        <TextInput
          classNames={{ input: S.searchInput }}
          placeholder={t`Search…`}
          value={search}
          leftSection={<Icon name="search" />}
          onChange={(event) => setSearch(event.currentTarget.value)}
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
          <ScrollArea className={S.scrollArea} offsetScrollbars="present">
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
                  <Accordion.Control
                    icon={<Icon name="table" c="text-secondary" />}
                  >
                    {group.display_name}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {dimensions.map((dimension) => (
                        <UnstyledButton
                          key={dimension.id}
                          className={S.addableRow}
                          onClick={() => handleAdd(group, dimension)}
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
