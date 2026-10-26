import { useMemo, useState } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProviderUnfiltered } from "metabase/metadata-store";
import { Box, Loader, Menu, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type { CardDisplayType, RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { FILTER_DRILLS_CLICK_MODE } from "../../harness/drillMode";

import {
  type DrillMenuModel,
  type DrillOption,
  type DrillOptionTarget,
  getDrillMenu,
  rowCountQuery,
} from "./drillMenu";

const CHART_HEIGHT = 420;

const SECTION_TITLES: Record<DrillOptionTarget, () => string> = {
  rows: () => t`Narrow the rows`,
  summary: () => t`Hide groups`,
  records: () => t`Look closer`,
};

type QuestionChartProps = {
  query: Lib.Query;
  display: CardDisplayType;
  /** `false` shows today's drill-through popover instead of the new menu. */
  hasNewMenu?: boolean;
  onPick: (query: Lib.Query, target: DrillOptionTarget) => void;
  /** Today's popover produced a new query. */
  onLegacyDrill?: (query: Lib.Query) => void;
};

type OpenMenu = { model: DrillMenuModel; x: number; y: number };

/**
 * The question's chart. Clicking a bar or point opens a menu phrased with the
 * values you clicked; hovering an option previews how many rows or bars it
 * leaves.
 */
export function QuestionChart({
  query,
  display,
  hasNewMenu = true,
  onPick,
  onLegacyDrill,
}: QuestionChartProps) {
  const metadataProvider = useMetadataProviderUnfiltered(Lib.databaseID(query));
  const jsQuery = useMemo(() => Lib.toJsQuery(query), [query]);
  const result = useGetAdhocQueryQuery({ ...jsQuery, ignore_error: true });
  const [menu, setMenu] = useState<OpenMenu>();

  const isAggregated = Lib.aggregations(query, 0).length > 0;
  const effectiveDisplay = isAggregated ? display : "table";
  const groupCount = result.data?.data?.rows.length ?? 0;
  const markNoun = effectiveDisplay === "line" ? t`points` : t`bars`;

  const rawSeries: RawSeries | undefined = useMemo(() => {
    if (!result.data?.data || result.data.data.cols.length === 0) {
      return undefined;
    }
    return [
      {
        card: createMockCard({
          dataset_query: jsQuery,
          display: effectiveDisplay,
          visualization_settings: {},
        }),
        data: result.data.data,
      },
    ];
  }, [result.data, jsQuery, effectiveDisplay]);

  const handleClick = (clicked: Lib.ClickObject | null) => {
    const event = clicked?.event;
    const model = clicked
      ? getDrillMenu({ query, clicked, groupCount, markNoun })
      : undefined;
    setMenu(
      model && event
        ? { model, x: event.clientX, y: event.clientY }
        : undefined,
    );
  };

  const errorMessage =
    result.error != null
      ? getErrorMessage(result.error)
      : result.data?.status === "failed"
        ? (result.data.error ?? t`Query failed`)
        : undefined;

  return (
    <Box
      h={CHART_HEIGHT}
      pos="relative"
      style={{
        opacity: result.isFetching ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      {errorMessage && (
        <Text c="feedback-negative">{String(errorMessage)}</Text>
      )}
      {rawSeries ? (
        <Visualization
          queryBuilderMode="dataset"
          rawSeries={rawSeries}
          mode={FILTER_DRILLS_CLICK_MODE}
          handleVisualizationClick={
            hasNewMenu && isAggregated ? handleClick : undefined
          }
          onChangeCardAndRun={({ nextCard }) =>
            onLegacyDrill?.(
              Lib.fromJsQuery(metadataProvider, nextCard.dataset_query),
            )
          }
        />
      ) : (
        result.isFetching && <Loader />
      )}
      {menu && (
        <DrillMenu
          menu={menu}
          query={query}
          markNoun={markNoun}
          onClose={() => setMenu(undefined)}
          onPick={(option) => {
            setMenu(undefined);
            onPick(option.apply(query), option.target);
          }}
        />
      )}
    </Box>
  );
}

type DrillMenuProps = {
  menu: OpenMenu;
  query: Lib.Query;
  markNoun: string;
  onClose: () => void;
  onPick: (option: DrillOption) => void;
};

function DrillMenu({ menu, query, markNoun, onClose, onPick }: DrillMenuProps) {
  const [previewId, setPreviewId] = useState<string>();
  const { model } = menu;
  const sections = (["rows", "summary", "records"] as const)
    .map((target) => ({
      target,
      options: model.options.filter((option) => option.target === target),
    }))
    .filter(({ options }) => options.length > 0);

  return (
    <Menu
      opened
      onChange={(opened) => !opened && onClose()}
      position="bottom-start"
      width={320}
    >
      <Menu.Target>
        <Box pos="fixed" left={menu.x} top={menu.y} w={1} h={1} />
      </Menu.Target>
      <Menu.Dropdown>
        <Box px="sm" pt="xs" pb="sm">
          <Text fw="bold">{model.header.join(" · ")}</Text>
          {model.measure && (
            <Text size="sm" c="text-secondary">
              {model.measure}
            </Text>
          )}
        </Box>
        {sections.map(({ target, options }) => (
          <Box key={target}>
            <Menu.Divider />
            <Menu.Label>{SECTION_TITLES[target]()}</Menu.Label>
            {options.map((option) => (
              <Menu.Item
                key={option.id}
                onMouseEnter={() => setPreviewId(option.id)}
                onFocus={() => setPreviewId(option.id)}
                onClick={() => onPick(option)}
                rightSection={
                  previewId === option.id && option.target !== "records" ? (
                    <PreviewCount
                      query={option.apply(query)}
                      target={option.target}
                      markNoun={markNoun}
                    />
                  ) : undefined
                }
              >
                <Text fw="bold" size="sm">
                  {option.title}
                </Text>
                <Text size="xs" c="text-secondary">
                  {option.detail}
                </Text>
              </Menu.Item>
            ))}
          </Box>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

type PreviewCountProps = {
  query: Lib.Query;
  target: DrillOptionTarget;
  markNoun: string;
};

/** Row filters count rows; thresholds count the bars that survive. */
function PreviewCount({ query, target, markNoun }: PreviewCountProps) {
  const countJsQuery = useMemo(
    () =>
      Lib.toJsQuery(
        target === "summary"
          ? Lib.aggregateByCount(Lib.appendStage(query), -1)
          : rowCountQuery(query),
      ),
    [query, target],
  );
  const result = useGetAdhocQueryQuery({ ...countJsQuery, ignore_error: true });
  const count = result.data?.data?.rows?.[0]?.[0];
  if (result.isFetching || typeof count !== "number") {
    return <Loader size="xs" />;
  }
  const noun = target === "summary" ? markNoun : t`rows`;
  return (
    <Text size="xs" c="text-secondary" style={{ whiteSpace: "nowrap" }}>
      {`→ ${count.toLocaleString()} ${noun}`}
    </Text>
  );
}
