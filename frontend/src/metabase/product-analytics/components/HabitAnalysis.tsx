import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useCompileAnalysisQuery,
  useCreateCardMutation,
  useGetAdhocQueryQuery,
  useGetTableQueryMetadataQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useNavigate } from "metabase/router";
import {
  Box,
  Button,
  Flex,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type {
  AnalysisColumns,
  AnalysisDateRange,
  AnalysisGrain,
  AnalysisInput,
  AnalysisSubPeriod,
  Card,
  ConcreteTableId,
  HabitSettings,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import { getQueryAnalysis } from "metabase-types/guards";

const DISPLAY = "bar";

const VISUALIZATION_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["periods"],
  "graph.metrics": ["actors"],
};

const RELATIVE_RANGES = ["30", "90", "180"];

type HabitAnalysisProps = {
  tableId: ConcreteTableId;
  /** The saved analysis this opens, if any. */
  card?: Card;
};

const relativeDays = (days: string): AnalysisDateRange => ({
  type: "relative",
  value: -Number(days),
  unit: "day",
});

const isGrain = (value: string): value is AnalysisGrain =>
  value === "person" || value === "session";

const isSubPeriod = (value: string): value is AnalysisSubPeriod =>
  value === "day" || value === "week";

export const HabitAnalysis = ({ tableId, card }: HabitAnalysisProps) => {
  const navigate = useNavigate();
  const savedAnalysis = getQueryAnalysis(card?.dataset_query);
  const savedSettings = savedAnalysis?.settings;
  const [settings, setSettings] = useState<Partial<HabitSettings>>(
    savedSettings ?? {},
  );
  const [chosenColumns, setChosenColumns] = useState<AnalysisColumns>();
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [createCard, { isLoading: isCreating }] = useCreateCardMutation();
  const [updateCard, { isLoading: isUpdating }] = useUpdateCardMutation();

  const input = useMemo<AnalysisInput>(
    () => ({
      table_id: tableId,
      kind: "habit",
      columns: savedAnalysis?.columns ?? chosenColumns,
      settings,
    }),
    [tableId, savedAnalysis, chosenColumns, settings],
  );
  const isUnchanged = card !== undefined && settings === savedSettings;
  const compiled = useCompileAnalysisQuery(isUnchanged ? skipToken : input);
  const query = isUnchanged ? card.dataset_query : compiled.data;
  const result = useGetAdhocQueryQuery(query ?? skipToken);
  const analysis = getQueryAnalysis(query);
  const { data: table } = useGetTableQueryMetadataQuery(
    card === undefined ? { id: tableId } : skipToken,
  );
  const columnOptions = (table?.fields ?? []).map(({ name, display_name }) => ({
    value: name,
    label: display_name,
  }));
  const timestampOptions = (table?.fields ?? [])
    .filter(({ base_type }) => isa(base_type, "type/Temporal"))
    .map(({ name, display_name }) => ({ value: name, label: display_name }));
  const columns = analysis?.columns ?? chosenColumns;
  const chooseColumn = (changes: Partial<AnalysisColumns>) =>
    setChosenColumns({
      timestamp: columns?.timestamp ?? "",
      person: columns?.person ?? "",
      session: columns?.session ?? null,
      ...changes,
    });

  const rawSeries = useMemo<RawSeries | null>(() => {
    if (query === undefined || result.data === undefined) {
      return null;
    }
    return [
      {
        card: {
          display: DISPLAY,
          dataset_query: query,
          visualization_settings: VISUALIZATION_SETTINGS,
        },
        data: result.data.data,
      },
    ];
  }, [query, result.data]);

  const handleSave = async () => {
    if (query === undefined) {
      return;
    }
    if (card !== undefined) {
      await updateCard({ id: card.id, dataset_query: query }).unwrap();
      return;
    }
    const { id } = await createCard({
      name,
      display: DISPLAY,
      visualization_settings: VISUALIZATION_SETTINGS,
      dataset_query: query,
    }).unwrap();
    setIsSaveOpen(false);
    navigate(Urls.savedAnalysis(id));
  };

  const dateRange = analysis?.settings.date_range;

  return (
    <Stack p="xl" h="100%">
      <Group justify="space-between">
        <Title order={2}>{card?.name ?? t`New habit analysis`}</Title>
        <Button
          variant="filled"
          disabled={query === undefined}
          loading={isUpdating}
          onClick={() =>
            card !== undefined ? handleSave() : setIsSaveOpen(true)
          }
        >{t`Save`}</Button>
      </Group>

      {card === undefined && (
        <Group>
          <Select
            label={t`Event time`}
            data={timestampOptions}
            value={columns?.timestamp || null}
            onChange={(timestamp) => timestamp && chooseColumn({ timestamp })}
          />
          <Select
            label={t`Person`}
            data={columnOptions}
            value={columns?.person || null}
            onChange={(person) => person && chooseColumn({ person })}
          />
          <Select
            label={t`Session`}
            clearable
            data={columnOptions}
            value={columns?.session ?? null}
            onChange={(session) => chooseColumn({ session })}
          />
        </Group>
      )}

      <Group>
        <SegmentedControl
          aria-label={t`Date range`}
          value={
            dateRange?.type === "relative" && dateRange.unit === "day"
              ? String(-dateRange.value)
              : ""
          }
          data={RELATIVE_RANGES.map((days) => ({
            value: days,
            label: t`Past ${days} days`,
          }))}
          onChange={(days) =>
            setSettings({ ...settings, date_range: relativeDays(days) })
          }
        />
        <SegmentedControl
          aria-label={t`Active in each`}
          value={analysis?.settings.sub_period ?? "day"}
          data={[
            { value: "day", label: t`Days` },
            { value: "week", label: t`Weeks` },
          ]}
          onChange={(value) =>
            isSubPeriod(value) &&
            setSettings({ ...settings, sub_period: value })
          }
        />
        {analysis?.columns.session != null && (
          <SegmentedControl
            aria-label={t`Counting`}
            value={analysis.settings.grain}
            data={[
              { value: "person", label: t`People` },
              { value: "session", label: t`Sessions` },
            ]}
            onChange={(value) =>
              isGrain(value) && setSettings({ ...settings, grain: value })
            }
          />
        )}
      </Group>

      <LoadingAndErrorWrapper
        loading={compiled.isFetching || result.isFetching}
        error={compiled.error ?? result.error}
        noWrapper
      >
        <Flex flex={1} mih="24rem">
          <Box flex={1}>
            {rawSeries !== null && <Visualization rawSeries={rawSeries} />}
          </Box>
        </Flex>
      </LoadingAndErrorWrapper>

      <Modal
        opened={isSaveOpen}
        title={t`Save analysis`}
        onClose={() => setIsSaveOpen(false)}
      >
        <Stack>
          <TextInput
            label={t`Name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            variant="filled"
            disabled={name.trim() === ""}
            loading={isCreating}
            onClick={handleSave}
          >{t`Save`}</Button>
        </Stack>
      </Modal>
    </Stack>
  );
};
