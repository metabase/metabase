import { useState } from "react";
import { t } from "ttag";

import {
  useAddMetricDimensionsMutation,
  useListMetricDimensionsQuery,
} from "metabase/api/metric";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
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
import type { MetricDimension, MetricId } from "metabase-types/api";

import S from "./MetricDimensions.module.css";
import { getDimensionIcon } from "./utils";

interface AddDimensionsPanelProps {
  metricId: MetricId;
  onDone: () => void;
}

export function AddDimensionsPanel({
  metricId,
  onDone,
}: AddDimensionsPanelProps) {
  const [search, setSearch] = useState("");
  const dispatch = useDispatch();
  const { data, isLoading, error } = useListMetricDimensionsQuery({
    metricId,
    with_addable: true,
    query: search || undefined,
  });
  const [addDimensions] = useAddMetricDimensionsMutation();

  const groups = data?.addable ?? [];
  const groupIds = groups.map(({ group }) => group.id);

  const handleAdd = async (dimension: MetricDimension) => {
    try {
      await addDimensions({
        metricId,
        dimension_ids: [dimension.id],
      }).unwrap();
    } catch {
      dispatch(addUndo({ message: t`Couldn't add ${dimension.display_name}` }));
    }
  };

  return (
    <Stack gap="md" className={S.column} data-testid="add-dimensions-panel">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Title order={4}>{t`Add more dimensions`}</Title>
          <Text
            c="text-secondary"
            size="sm"
          >{t`You can pick one or many.`}</Text>
        </Box>
        <Button variant="filled" onClick={onDone}>{t`Done`}</Button>
      </Group>

      <TextInput
        placeholder={t`Search…`}
        value={search}
        leftSection={<Icon name="search" />}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />

      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <ScrollArea className={S.scrollArea}>
          <Accordion key={groupIds.join(",")} multiple defaultValue={groupIds}>
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
                        onClick={() => handleAdd(dimension)}
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
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
