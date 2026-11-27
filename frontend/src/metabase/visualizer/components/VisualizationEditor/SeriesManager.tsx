import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardDimensionOptionsQuery,
  useSearchQuery,
} from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
// The dimension picker of the metrics explorer is reused here as it is.
// Moving it to a shared module is not worth it before the design settles.
// eslint-disable-next-line boundaries/element-types
import { CategoryButton } from "metabase/metrics-viewer/components/DimensionPickerSidebar/components/CategoryButton";
// eslint-disable-next-line boundaries/element-types
import { MetricDimensionSelect } from "metabase/metrics-viewer/components/DimensionPickerSidebar/components/MetricDimensionSelect";
import { useDispatch, useSelector } from "metabase/redux";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Flex,
  Icon,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import {
  getCurrentVisualizerState,
  getDatasets,
  getIsLoading,
  getUsedDataSources,
  getVisualizationColumns,
  getVisualizerColumnValuesMapping,
  getVisualizerComputedSettings,
  getVisualizerRawSeries,
  getVisualizerRawSettings,
} from "metabase/visualizer/selectors";
import { isDataSourceNameRef } from "metabase/visualizer/utils";
import {
  addDataSource,
  removeDataSource,
  setSeriesDimension,
  setVisualizationAxis,
} from "metabase/visualizer/visualizer.slice";
import type {
  CardDimensionOptions,
  DashboardId,
  DatasetColumn,
  IconName,
  VisualizerColumnReference,
  VisualizerColumnValueSource,
  VisualizerDataSource,
  VisualizerDataSourceId,
  VisualizerDimensionAxis,
  VisualizerDimensionKind,
  VisualizerDimensionOption,
} from "metabase-types/api";

import S from "./VisualizationEditor.module.css";

const getTemporalUnits = () => [
  { value: "day", label: t`Day` },
  { value: "week", label: t`Week` },
  { value: "month", label: t`Month` },
  { value: "quarter", label: t`Quarter` },
  { value: "year", label: t`Year` },
];

const DEFAULT_TEMPORAL_UNIT = "month";

const isColumnRef = (
  source: VisualizerColumnValueSource,
): source is VisualizerColumnReference => !isDataSourceNameRef(source);

const getOptionKey = (option: {
  fieldId: number;
  sourceFieldId?: number | null;
}) => `${option.fieldId}:${option.sourceFieldId ?? ""}`;

// Use the stored settings: with several questions the chart splits into one
// series per question, and the computed settings describe only the first one.
function useDataSettings() {
  const rawSettings = useSelector(getVisualizerRawSettings);
  const computedSettings = useSelector(getVisualizerComputedSettings);
  return {
    dimensions:
      rawSettings["graph.dimensions"] ?? computedSettings["graph.dimensions"],
    metrics: rawSettings["graph.metrics"] ?? computedSettings["graph.metrics"],
  };
}

function useAxisColumn() {
  const { dimensions } = useDataSettings();
  const columnValuesMapping = useSelector(getVisualizerColumnValuesMapping);
  const datasets = useSelector(getDatasets);

  const dimensionName = dimensions?.[0];
  const ref = dimensionName
    ? columnValuesMapping[dimensionName]?.find(isColumnRef)
    : undefined;
  const column = ref
    ? datasets[ref.sourceId]?.data?.cols.find(
        (col) => col.name === ref.originalName,
      )
    : undefined;

  return { sourceId: ref?.sourceId, column };
}

const KIND_ORDER: VisualizerDimensionKind[] = [
  "time",
  "geo",
  "category",
  "boolean",
  "numeric",
];

const KIND_ICONS: Record<VisualizerDimensionKind, IconName> = {
  time: "calendar",
  geo: "location",
  category: "string",
  boolean: "io",
  numeric: "int",
};

const COLLAPSED_CATEGORY_COUNT = 8;

type AxisCategory = {
  key: string;
  name: string;
  kind: VisualizerDimensionKind;
  optionsBySource: Partial<
    Record<VisualizerDataSourceId, VisualizerDimensionOption[]>
  >;
};

type SourceColumn = {
  fieldId: number;
  sourceFieldId: number | null;
  unit: string | null;
};

const isSameColumn = (
  a: { fieldId?: number | null; sourceFieldId?: number | null },
  b: { fieldId?: number | null; sourceFieldId?: number | null },
) =>
  a.fieldId === b.fieldId &&
  (a.sourceFieldId ?? null) === (b.sourceFieldId ?? null);

// The column that a question uses for the x-axis: the group-by of its dataset.
function useSourceColumns() {
  const datasets = useSelector(getDatasets);
  return useMemo(() => {
    const result: Partial<Record<VisualizerDataSourceId, SourceColumn>> = {};
    Object.entries(datasets).forEach(([sourceId, dataset]) => {
      const column = dataset?.data?.cols.find(
        (col) => col.source === "breakout",
      );
      if (column && typeof column.id === "number") {
        // The datasets are keyed by data source id, but Object.entries gives
        // plain strings.
        result[sourceId as VisualizerDataSourceId] = {
          fieldId: column.id,
          sourceFieldId: column.fk_field_id ?? null,
          unit: column.unit ?? null,
        };
      }
    });
    return result;
  }, [datasets]);
}

// The dimension categories that every question has a column of, as in the
// metrics explorer: time, geo types, and columns with the same name.
function getAxisCategories(
  sources: VisualizerDataSource[],
  optionsByCard: Record<string, CardDimensionOptions>,
) {
  const categories = new Map<string, AxisCategory>();
  sources.forEach((source) => {
    const options = optionsByCard[source.sourceId];
    const columns = options?.supported ? (options.columns ?? []) : [];
    columns.forEach((column) => {
      const category = categories.get(column.categoryKey) ?? {
        key: column.categoryKey,
        name: column.categoryName,
        kind: column.kind,
        optionsBySource: {},
      };
      (category.optionsBySource[source.id] ??= []).push(column);
      categories.set(column.categoryKey, category);
    });
  });
  return [...categories.values()]
    .filter((category) =>
      sources.every((source) => category.optionsBySource[source.id]?.length),
    )
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

function useSeriesBySource() {
  const { metrics } = useDataSettings();
  const columnValuesMapping = useSelector(getVisualizerColumnValuesMapping);
  const columns = useSelector(getVisualizationColumns);

  return useMemo(() => {
    const result: Record<VisualizerDataSourceId, DatasetColumn[]> = {};
    for (const metricName of metrics ?? []) {
      if (!metricName) {
        continue;
      }
      const ref = columnValuesMapping[metricName]?.find(isColumnRef);
      const column = columns.find((col) => col.name === metricName);
      if (ref && column) {
        (result[ref.sourceId] ??= []).push(column);
      }
    }
    return result;
  }, [metrics, columnValuesMapping, columns]);
}

export function SeriesManager({
  dashboardId,
}: {
  dashboardId: DashboardId | undefined;
}) {
  const rawSeries = useSelector(getVisualizerRawSeries);
  const isLoading = useSelector(getIsLoading);
  const dataSources = useSelector(getUsedDataSources);
  const { dimensionOverrides = {} } = useSelector(getCurrentVisualizerState);
  const { sourceId: mainSourceId, column: axisColumn } = useAxisColumn();
  const seriesBySource = useSeriesBySource();
  const [isPickerOpen, setPickerOpen] = useState(false);

  const cardIds = dataSources.map((source) => source.sourceId);
  const { data: optionsByCard = {} } = useGetCardDimensionOptionsQuery(
    cardIds.length > 0
      ? { card_ids: cardIds, include_columns: true }
      : skipToken,
  );

  const sourceColumns = useSourceColumns();

  const orderedSources = useMemo(
    () =>
      [...dataSources].sort(
        (a, b) => Number(b.id === mainSourceId) - Number(a.id === mainSourceId),
      ),
    [dataSources, mainSourceId],
  );

  const categories = useMemo(
    () => getAxisCategories(orderedSources, optionsByCard),
    [orderedSources, optionsByCard],
  );

  const mainSource = orderedSources[0];
  const mainOptions = mainSource
    ? optionsByCard[mainSource.sourceId]
    : undefined;
  const mainColumn = mainSource ? sourceColumns[mainSource.id] : undefined;
  const mainOption =
    mainOptions?.supported && mainColumn
      ? mainOptions.columns?.find((option) => isSameColumn(option, mainColumn))
      : undefined;
  const axis: VisualizerDimensionAxis | undefined =
    mainOption && mainColumn
      ? {
          key: mainOption.categoryKey,
          temporalUnit: mainOption.temporal
            ? (mainColumn.unit ?? DEFAULT_TEMPORAL_UNIT)
            : null,
          fieldId: mainColumn.fieldId,
          sourceFieldId: mainColumn.sourceFieldId,
          displayName: mainOption.categoryName,
        }
      : undefined;
  const unsupportedSources = orderedSources.filter(
    (source) => optionsByCard[source.sourceId]?.supported === false,
  );

  return (
    <Box className={S.SeriesLayout}>
      <Box className={S.Chart}>
        {rawSeries.length > 0 ? (
          <Visualization rawSeries={rawSeries} isDashboard isVisualizer />
        ) : (
          <Center h="100%">
            <Loader />
          </Center>
        )}
      </Box>

      <Stack className={S.Panel} gap="lg" p="lg">
        <AxisCategories
          axis={axis}
          axisColumnName={axisColumn?.display_name}
          categories={categories}
          sources={orderedSources}
          unsupportedSources={unsupportedSources}
          optionsByCard={optionsByCard}
          sourceColumns={sourceColumns}
          isLoading={isLoading}
        />

        <Stack gap="xs">
          <Text fw="bold" c="text-secondary" size="sm">{t`Series`}</Text>
          {orderedSources.map((source) => {
            const options = optionsByCard[source.sourceId];
            return (
              <SourceRow
                key={source.id}
                source={source}
                metrics={seriesBySource[source.id] ?? []}
                isMain={source.id === mainSourceId}
                canRemove={source.id !== mainSourceId}
                regroupNote={
                  dimensionOverrides[source.id] && options?.supported
                    ? options.current
                      ? t`Regrouped for this chart. The question is grouped by ${options.current.displayName}.`
                      : t`Grouped for this chart. It has no grouping of its own.`
                    : undefined
                }
              />
            );
          })}
        </Stack>

        {axis &&
          (isPickerOpen ? (
            <QuestionPicker
              axis={axis}
              usedSourceIds={dataSources.map((source) => source.id)}
              dashboardId={dashboardId}
              onClose={() => setPickerOpen(false)}
            />
          ) : (
            <Button
              leftSection={<Icon name="add" />}
              onClick={() => setPickerOpen(true)}
            >{t`Add series`}</Button>
          ))}
      </Stack>
    </Box>
  );
}

function AxisCategories({
  axis,
  axisColumnName,
  categories,
  sources,
  unsupportedSources,
  optionsByCard,
  sourceColumns,
  isLoading,
}: {
  axis: VisualizerDimensionAxis | undefined;
  axisColumnName: string | undefined;
  categories: AxisCategory[];
  sources: VisualizerDataSource[];
  unsupportedSources: VisualizerDataSource[];
  optionsByCard: Record<string, CardDimensionOptions>;
  sourceColumns: Partial<Record<VisualizerDataSourceId, SourceColumn>>;
  isLoading: boolean;
}) {
  const dispatch = useDispatch();
  const [isExpanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query) {
      return categories.filter((category) =>
        category.name.toLowerCase().includes(query),
      );
    }
    if (showAll || categories.length <= COLLAPSED_CATEGORY_COUNT) {
      return categories;
    }
    const visible = categories.slice(0, COLLAPSED_CATEGORY_COUNT);
    const selected = categories.find((category) => category.key === axis?.key);
    return selected && !visible.includes(selected)
      ? [...visible, selected]
      : visible;
  }, [categories, search, showAll, axis?.key]);

  const handleSelectCategory = (category: AxisCategory) => {
    if (category.key === axis?.key) {
      setExpanded((value) => !value);
      return;
    }
    const [mainSource] = sources;
    const mainColumn = sourceColumns[mainSource.id];
    const mainOptions = category.optionsBySource[mainSource.id] ?? [];
    const mainOption =
      (mainColumn &&
        mainOptions.find((option) => isSameColumn(option, mainColumn))) ||
      mainOptions.find((option) => option.sourceFieldId === null) ||
      mainOptions[0];
    dispatch(
      setVisualizationAxis({
        key: category.key,
        temporalUnit:
          category.kind === "time"
            ? (axis?.temporalUnit ?? DEFAULT_TEMPORAL_UNIT)
            : null,
        fieldId: mainOption?.fieldId,
        sourceFieldId: mainOption?.sourceFieldId,
        displayName: category.name,
      }),
    );
    setExpanded(true);
  };

  const handleChangeUnit = (unit: string | null) => {
    if (axis && unit) {
      dispatch(setVisualizationAxis({ ...axis, temporalUnit: unit }));
    }
  };

  const handleChangeColumn = (
    source: VisualizerDataSource,
    option: VisualizerDimensionOption,
  ) => {
    const options = optionsByCard[source.sourceId];
    const current = options?.supported ? options.current : null;
    const temporalUnit = option.temporal ? (axis?.temporalUnit ?? null) : null;
    // Picking the own group-by of the question removes the override.
    const isOwnGroupBy =
      current != null &&
      isSameColumn(current, option) &&
      (current.temporalUnit ?? null) === temporalUnit;
    dispatch(
      setSeriesDimension({
        sourceId: source.id,
        override: isOwnGroupBy
          ? undefined
          : {
              fieldId: option.fieldId,
              sourceFieldId: option.sourceFieldId,
              temporalUnit,
            },
      }),
    );
  };

  if (unsupportedSources.length > 0 || !axis) {
    return (
      <Stack gap="xs">
        <Text fw="bold" c="text-secondary" size="sm">{t`Shared x-axis`}</Text>
        <Text fw="bold">{axisColumnName ?? t`None`}</Text>
        <Text size="sm" c="text-secondary">
          {unsupportedSources.length > 0
            ? t`The x-axis can't change, because ${unsupportedSources
                .map((source) => source.name)
                .join(", ")} can't be regrouped.`
            : t`This chart has no x-axis that can change.`}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Text fw="bold" c="text-secondary" size="sm">{t`Shared x-axis`}</Text>
      <Text size="sm" c="text-secondary">
        {sources.length > 1
          ? t`Dimensions that every series has. Each series can use its own column of the dimension. The questions themselves don't change.`
          : t`Dimensions of this question.`}
      </Text>
      {categories.length > COLLAPSED_CATEGORY_COUNT && (
        <TextInput
          size="sm"
          placeholder={t`Search dimensions`}
          leftSection={<Icon name="search" />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      )}
      <Stack gap={2}>
        {visibleCategories.map((category) => {
          const isSelected = category.key === axis.key;
          return (
            <Box key={category.key}>
              <CategoryButton
                item={{ name: category.name, icon: KIND_ICONS[category.kind] }}
                isSelected={isSelected}
                canConfigure={isSelected}
                isExpanded={isSelected && isExpanded}
                onClick={() => handleSelectCategory(category)}
                onConfigure={() => setExpanded((value) => !value)}
              />
              {isSelected && isExpanded && (
                <Stack gap="xs" pl="2rem" pt="xs" pb="sm">
                  {category.kind === "time" && (
                    <Select
                      size="sm"
                      label={t`Time grouping`}
                      data={getTemporalUnits()}
                      value={axis.temporalUnit ?? DEFAULT_TEMPORAL_UNIT}
                      onChange={handleChangeUnit}
                      disabled={isLoading}
                    />
                  )}
                  {sources.map((source) => {
                    const options = category.optionsBySource[source.id] ?? [];
                    const column = sourceColumns[source.id];
                    const value = column ? getOptionKey(column) : null;
                    return (
                      <MetricDimensionSelect
                        key={source.id}
                        row={{
                          metricName: source.name,
                          isExpressionToken: false,
                          value,
                          options: options.map((option) => ({
                            value: getOptionKey(option),
                            label: option.displayName,
                            icon: KIND_ICONS[option.kind],
                          })),
                        }}
                        onChange={(key) => {
                          const option = options.find(
                            (option) => getOptionKey(option) === key,
                          );
                          if (option && key !== value) {
                            handleChangeColumn(source, option);
                          }
                        }}
                      />
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>
      {!search && categories.length > COLLAPSED_CATEGORY_COUNT && (
        <Button variant="subtle" onClick={() => setShowAll((value) => !value)}>
          {showAll ? t`Show fewer` : t`See all ${categories.length} dimensions`}
        </Button>
      )}
    </Stack>
  );
}

function SourceRow({
  source,
  metrics,
  isMain,
  canRemove,
  regroupNote,
}: {
  source: VisualizerDataSource;
  metrics: DatasetColumn[];
  isMain: boolean;
  canRemove: boolean;
  regroupNote: string | undefined;
}) {
  const dispatch = useDispatch();

  return (
    <Flex className={S.SourceRow} align="flex-start" gap="sm" p="sm">
      <Icon name="table2" mt={2} c="text-secondary" />
      <Stack gap={2} flex={1} miw={0}>
        <Flex align="center" gap="xs">
          <Text fw="bold" truncate>
            {source.name}
          </Text>
          {isMain && <Badge size="xs">{t`Main`}</Badge>}
        </Flex>
        <Text size="sm" c="text-secondary">
          {metrics.length > 0
            ? metrics.map((metric) => metric.display_name).join(", ")
            : t`No series`}
        </Text>
        {regroupNote && (
          <Flex align="center" gap={4}>
            <Icon name="arrow_split" size={12} c="text-secondary" />
            <Text size="xs" c="text-secondary">
              {regroupNote}
            </Text>
          </Flex>
        )}
      </Stack>
      {canRemove && (
        <Tooltip label={t`Remove from this chart`}>
          <ActionIcon
            variant="subtle"
            aria-label={t`Remove ${source.name}`}
            onClick={() => dispatch(removeDataSource({ source }))}
          >
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
      )}
    </Flex>
  );
}

type PickerItem = {
  id: number;
  name: string;
  options: CardDimensionOptions | undefined;
};

function getRegroupNote(item: PickerItem) {
  const options = item.options;
  const match = options?.supported ? options.axis : undefined;
  if (!options?.supported || match?.status !== "regroup") {
    return undefined;
  }
  const from = options.current?.displayName;
  const unit = getTemporalUnits().find(
    ({ value }) => value === match.override.temporalUnit,
  );
  const column = match.column.displayName;
  const to = unit ? `${column}: ${unit.label}` : column;
  return from ? t`Regrouped by ${to} instead of ${from}` : t`Grouped by ${to}`;
}

function getIncompatibleReason(item: PickerItem) {
  const options = item.options;
  if (!options) {
    return t`Can't be regrouped`;
  }
  if (!options.supported) {
    return options.reason;
  }
  return options.axis?.status === "incompatible"
    ? options.axis.reason
    : undefined;
}

function QuestionPicker({
  axis,
  usedSourceIds,
  dashboardId,
  onClose,
}: {
  axis: VisualizerDimensionAxis;
  usedSourceIds: VisualizerDataSourceId[];
  dashboardId: DashboardId | undefined;
  onClose: () => void;
}) {
  const dispatch = useDispatch();
  const [search, setSearch] = useState("");
  const [showIncompatible, setShowIncompatible] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: searchData, isFetching: isSearching } = useSearchQuery({
    q: debouncedSearch || undefined,
    limit: 200,
    models: ["card", "dataset", "metric"],
    include_dashboard_questions: true,
    context: "data-picker",
  });

  const candidates = useMemo(
    () =>
      (searchData?.data ?? [])
        .filter(
          (item) =>
            !usedSourceIds.includes(`card:${Number(item.id)}`) &&
            (!item.dashboard || item.dashboard.id === dashboardId),
        )
        .map((item) => ({ id: Number(item.id), name: item.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searchData, usedSourceIds, dashboardId],
  );

  const { data: optionsByCard, isFetching: isMatching } =
    useGetCardDimensionOptionsQuery(
      candidates.length > 0
        ? { card_ids: candidates.map((item) => item.id), axis }
        : skipToken,
    );

  const { matching, regrouped, incompatible } = useMemo(() => {
    const items: PickerItem[] = candidates.map((item) => ({
      ...item,
      options: optionsByCard?.[item.id],
    }));
    const status = (item: PickerItem) =>
      item.options?.supported ? item.options.axis?.status : undefined;
    return {
      matching: items.filter((item) => status(item) === "match"),
      regrouped: items.filter((item) => status(item) === "regroup"),
      incompatible: items.filter(
        (item) => status(item) !== "match" && status(item) !== "regroup",
      ),
    };
  }, [candidates, optionsByCard]);

  const handleAdd = (item: PickerItem) => {
    const match = item.options?.supported ? item.options.axis : undefined;
    dispatch(
      addDataSource({
        id: `card:${item.id}`,
        dimensionOverride:
          match?.status === "regroup" ? match.override : undefined,
      }),
    );
    onClose();
  };

  const isPending =
    (isSearching && !searchData) || (isMatching && !optionsByCard);

  return (
    <Stack gap="xs" className={S.Picker} p="sm">
      <Flex align="center" gap="xs">
        <TextInput
          flex={1}
          autoFocus
          placeholder={t`Search questions and metrics`}
          leftSection={<Icon name="search" />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <ActionIcon variant="subtle" aria-label={t`Close`} onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Flex>

      {isPending ? (
        <Loader size="sm" />
      ) : (
        <>
          <PickerGroup
            title={t`Same x-axis`}
            items={matching}
            onAdd={handleAdd}
          />
          <PickerGroup
            title={t`Can be regrouped onto this x-axis`}
            items={regrouped}
            onAdd={handleAdd}
            getNote={getRegroupNote}
          />
          {matching.length === 0 && regrouped.length === 0 && (
            <Text c="text-secondary" p="sm">
              {t`No questions can use this x-axis.`}
            </Text>
          )}
        </>
      )}

      {!isPending && incompatible.length > 0 && (
        <Stack gap={0}>
          <UnstyledButton
            className={S.PickerItem}
            onClick={() => setShowIncompatible((value) => !value)}
          >
            <Text size="sm" c="text-secondary">
              {showIncompatible
                ? t`Hide questions that can't use this x-axis`
                : t`${incompatible.length} questions can't use this x-axis`}
            </Text>
          </UnstyledButton>
          {showIncompatible &&
            incompatible.map((item) => (
              <Box key={item.id} className={S.PickerItemDisabled}>
                <Text c="text-secondary" truncate>
                  {item.name}
                </Text>
                <Text size="xs" c="text-secondary">
                  {getIncompatibleReason(item)}
                </Text>
              </Box>
            ))}
        </Stack>
      )}
    </Stack>
  );
}

function PickerGroup({
  title,
  items,
  onAdd,
  getNote,
}: {
  title: string;
  items: PickerItem[];
  onAdd: (item: PickerItem) => void;
  getNote?: (item: PickerItem) => string | undefined;
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Stack gap={0}>
      <Text size="xs" fw="bold" c="text-secondary" px="sm" pt="xs">
        {title}
      </Text>
      {items.map((item) => {
        const note = getNote?.(item);
        return (
          <UnstyledButton
            key={item.id}
            className={S.PickerItem}
            onClick={() => onAdd(item)}
          >
            <Flex align="flex-start" gap="sm">
              <Icon name="add" c="text-brand" mt={2} />
              <Stack gap={0} miw={0}>
                <Text truncate>{item.name}</Text>
                {note && (
                  <Text size="xs" c="text-secondary">
                    {note}
                  </Text>
                )}
              </Stack>
            </Flex>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
