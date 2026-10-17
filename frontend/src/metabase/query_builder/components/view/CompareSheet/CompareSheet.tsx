import { clamp } from "@mantine/hooks";
import {
  type RefObject,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { metricApi } from "metabase/api";
import { encodeState } from "metabase/common/metrics-viewer";
import { useDispatch } from "metabase/redux";
import {
  Box,
  Card,
  Center,
  Group,
  Icon,
  Loader,
  Text,
  Tooltip,
} from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Metric, MetricId } from "metabase-types/api";

import {
  PLUGIN_QUERY_BUILDER,
  type QueryBuilderMetricsExplorerDescription,
} from "../../../plugins";
import { useSummaryDefinition } from "../SummarySheet/summary-store";
import { getSummaryKey } from "../SummarySheet/utils";

import S from "./CompareSheet.module.css";
import {
  setCompareHash,
  updateCompareTitle,
  useCompareState,
} from "./compare-store";
import { getCompareInput, getCompareSeed, getCompareSeedKey } from "./utils";

type CompareSheetProps = {
  question: Question;
  /** Where the sheet grows out of: the Compare button that opened it. */
  origin: DOMRect;
};

/**
 * The compare sheet: the metrics explorer, seeded with the summary's metrics narrowed down by
 * the data tab's filters, each next to the same metric across all the data.
 */
export function CompareSheet({ question, origin }: CompareSheetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const summaryKey = getSummaryKey(question);
  const summaryDefinition = useSummaryDefinition(summaryKey);
  const input = useMemo(
    () => getCompareInput(question, summaryDefinition),
    [question, summaryDefinition],
  );
  const seedKey = useMemo(() => getCompareSeedKey(input), [input]);
  const metrics = useMetrics(input.metricIds);
  const seed = useMemo(
    () => (metrics ? getCompareSeed(input, metrics) : null),
    [input, metrics],
  );
  const notAppliedFilterLabels = [
    ...input.unsupportedFilterLabels,
    ...(seed?.unmatchedFilterLabels ?? []),
  ];

  useGrowFromOrigin(rootRef, origin);

  return (
    <Card
      ref={rootRef}
      className={S.root}
      withBorder
      p={0}
      data-testid="compare-sheet"
    >
      <Box className={S.morph} data-morph />
      {notAppliedFilterLabels.length > 0 && (
        <Tooltip
          label={t`Not applied: ${notAppliedFilterLabels.join(", ")}`}
          multiline
          maw={320}
        >
          <Group className={S.notice} gap="xs" wrap="nowrap">
            <Icon name="warning" size={14} />
            <Text c="inherit" size="sm">
              {t`Some filters couldn't be carried over to these metrics`}
            </Text>
          </Group>
        </Tooltip>
      )}
      {input.metricIds.length === 0 ? (
        <Center h="100%">
          <Text c="text-secondary">{t`There are no metrics on this data to compare yet.`}</Text>
        </Center>
      ) : seed && summaryKey != null ? (
        <CompareExplorer
          key={seedKey}
          storeKey={summaryKey}
          seedKey={seedKey}
          seedHash={encodeState(seed.state) ?? ""}
        />
      ) : (
        <Center h="100%">
          <Loader />
        </Center>
      )}
    </Card>
  );
}

/** The header title for what the explorer shows, e.g. "Revenue vs. Revenue · State is CA by Category". */
function getCompareTitle({
  seriesNames,
  breakoutLabel,
}: QueryBuilderMetricsExplorerDescription): string {
  const seriesTitle = seriesNames.join(t` vs. `);
  return breakoutLabel ? t`${seriesTitle} by ${breakoutLabel}` : seriesTitle;
}

type CompareExplorerProps = {
  storeKey: string;
  seedKey: string;
  seedHash: string;
};

function CompareExplorer({
  storeKey,
  seedKey,
  seedHash,
}: CompareExplorerProps) {
  const storedState = useCompareState(storeKey);
  // the user's changes survive leaving the sheet, until the data or summary changes what to compare
  const [initialHash] = useState(() =>
    storedState?.seedKey === seedKey ? storedState.hash : seedHash,
  );

  useEffect(() => {
    if (storedState?.seedKey !== seedKey) {
      setCompareHash(storeKey, seedKey, initialHash);
    }
  }, [storeKey, seedKey, storedState, initialHash]);

  return (
    <Box className={S.explorer}>
      <Suspense
        fallback={
          <Center h="100%">
            <Loader />
          </Center>
        }
      >
        <PLUGIN_QUERY_BUILDER.MetricsExplorer
          initialHash={initialHash}
          onHashChange={(hash) => setCompareHash(storeKey, seedKey, hash)}
          onDescriptionChange={(description) =>
            updateCompareTitle(storeKey, seedKey, getCompareTitle(description))
          }
        />
      </Suspense>
    </Box>
  );
}

/** Loads the metrics with their dimensions; `null` until all of them have loaded. */
function useMetrics(metricIds: MetricId[]): Metric[] | null {
  const dispatch = useDispatch();
  const metricIdsKey = metricIds.join(",");
  const [loaded, setLoaded] = useState<{
    metricIdsKey: string;
    metrics: Metric[];
  } | null>(null);

  useEffect(() => {
    const requests = metricIdsKey
      .split(",")
      .filter((id) => id.length > 0)
      .map((id) =>
        dispatch(metricApi.endpoints.getMetric.initiate(Number(id))),
      );
    let isCancelled = false;
    Promise.all(requests.map((request) => request.unwrap())).then(
      (metrics) => {
        if (!isCancelled) {
          setLoaded({ metricIdsKey, metrics });
        }
      },
      () => {
        if (!isCancelled) {
          setLoaded({ metricIdsKey, metrics: [] });
        }
      },
    );
    return () => {
      isCancelled = true;
      requests.forEach((request) => request.unsubscribe());
    };
  }, [dispatch, metricIdsKey]);

  return loaded?.metricIdsKey === metricIdsKey ? loaded.metrics : null;
}

const GROW_DURATION_MS = 650;

/**
 * Animates the sheet out of `origin`: from a pill under the origin at the sheet's top edge, it
 * stretches across the full width, as if the button became a bar, then unfolds down.
 */
function useGrowFromOrigin(
  rootRef: RefObject<HTMLDivElement>,
  origin: DOMRect,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const morph = root?.querySelector<HTMLElement>("[data-morph]");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!root || !morph || prefersReducedMotion) {
      return;
    }

    const bounds = root.getBoundingClientRect();
    const width = Math.min(origin.width, bounds.width);
    const height = Math.min(origin.height, bounds.height);
    const left = clamp(origin.left - bounds.left, 0, bounds.width - width);
    const top = clamp(origin.top - bounds.top, 0, bounds.height - height);
    const right = bounds.width - left - width;
    const bottom = bounds.height - top - height;
    const pillRadius = height / 2;
    const sheetRadius = getComputedStyle(root).borderRadius;
    const timing = {
      duration: GROW_DURATION_MS,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    };

    const grow = root.animate(
      [
        {
          clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${pillRadius}px)`,
        },
        {
          clipPath: `inset(${top}px 0px ${bottom}px 0px round ${pillRadius}px)`,
          offset: 0.4,
        },
        { clipPath: `inset(0px 0px 0px 0px round ${sheetRadius})` },
      ],
      timing,
    );
    const fade = morph.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }],
      { ...timing, fill: "forwards" },
    );
    return () => {
      grow.cancel();
      fade.cancel();
    };
    // only when opening; later renders keep the sheet in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
