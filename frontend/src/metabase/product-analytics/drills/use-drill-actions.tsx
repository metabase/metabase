import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { ConcreteTableId } from "metabase-types/api";

import type { CommonSettings } from "../analyses/types";
import { BreakoutPopover } from "../components/drills/BreakoutPopover";
import { NewAnalysisPopover } from "../components/drills/NewAnalysisPopover";
import type { CohortFilter } from "../filters";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";
import type { DrillPoint } from "../sql/compose";
import { encodeSettings } from "../url-state";

import { getDrillCount, getDrillPoint } from "./describe";
import {
  getSaveSegmentTitle,
  getSeeMembersTitle,
  getStartAnalysisTitle,
} from "./labels";
import type { ChartDrill } from "./types";
import type { DrillQueries } from "./use-drill-queries";

const STAGE = -1;

export type DrillModal =
  | { type: "members"; drill: ChartDrill }
  | { type: "segment"; drill: ChartDrill };

type UseDrillActionsArgs = {
  tableId: ConcreteTableId | undefined;
  stored: StoredSettings;
  settings: CommonSettings;
  /** The chart's count column, e.g. "people". */
  countColumn: string;
  describePoint: (point: DrillPoint) => string | null;
  queries: DrillQueries;
  /** Actions offered before the drills, e.g. into a supporting analysis. */
  getExtraActions?: (clicked: ClickObject) => ClickAction[];
};

/** Settings a new analysis keeps from this one: who it counts, and how. */
const getCarriedSettings = (
  stored: StoredSettings,
  settings: CommonSettings,
  cohort: CohortFilter,
): StoredSettings => ({
  ...Object.fromEntries(
    Object.entries(stored).filter(([key]) => key.startsWith("columns.")),
  ),
  counting: settings.counting,
  date_range: settings.date_range,
  filters: {
    ...settings.filters,
    cohorts: [...settings.filters.cohorts, cohort],
  },
});

/**
 * The click actions on an analysis's chart, and the modal one of them opened.
 */
export const useDrillActions = ({
  tableId,
  stored,
  settings,
  countColumn,
  describePoint,
  queries,
  getExtraActions,
}: UseDrillActionsArgs) => {
  const navigate = useNavigate();
  const [modal, setModal] = useState<DrillModal | null>(null);
  // The analysis lives in its URL, so browser back restores it after a drill.
  const isDrillingRef = useRef(false);
  const navigateAway = useCallback(
    (url: string) => {
      isDrillingRef.current = true;
      navigate(url);
      // A same-kind drill stays on this page, which should keep its guard.
      setTimeout(() => {
        isDrillingRef.current = false;
      });
    },
    [navigate],
  );
  const { grain, fetchMemberIds, buildCohortEventsQuery, canDrill } = queries;

  const toCohort = useCallback(
    async (drill: ChartDrill): Promise<CohortFilter> => ({
      label: drill.label,
      grain,
      ids: await fetchMemberIds(drill.point),
    }),
    [grain, fetchMemberIds],
  );

  const startAnalysis = useCallback(
    async (kind: AnalysisKind, drill: ChartDrill) => {
      if (tableId === undefined) {
        return;
      }
      const cohort = await toCohort(drill);
      const hash = encodeSettings(getCarriedSettings(stored, settings, cohort));
      navigateAway(`${Urls.eventAnalysis(kind, tableId)}#${hash}`);
    },
    [tableId, stored, settings, toCohort, navigateAway],
  );

  const breakout = useCallback(
    async (column: Lib.ColumnMetadata, drill: ChartDrill) => {
      const cohort = await toCohort(drill);
      const counted = Lib.aggregateByCount(
        buildCohortEventsQuery(cohort),
        STAGE,
      );
      const match = Lib.findMatchingColumn(
        counted,
        STAGE,
        column,
        Lib.breakoutableColumns(counted, STAGE),
      );
      if (match === null) {
        throw new Error(t`That column isn't available anymore.`);
      }
      const query = Lib.breakout(
        counted,
        STAGE,
        Lib.withDefaultBucket(counted, STAGE, match),
      );
      navigateAway(
        Urls.serializedQuestion({
          display: Lib.isTemporal(match) ? "line" : "bar",
          dataset_query: Lib.toJsQuery(query),
          visualization_settings: {},
        }),
      );
    },
    [toCohort, buildCohortEventsQuery, navigateAway],
  );

  // Columns to break out by. The cohort's filter is added once it's chosen.
  const breakoutQuery = useMemo(() => {
    try {
      return Lib.aggregateByCount(
        buildCohortEventsQuery({ label: "", grain, ids: [""] }),
        STAGE,
      );
    } catch {
      return undefined;
    }
  }, [buildCohortEventsQuery, grain]);

  const mode = useMemo((): ClickActionsMode => {
    const getDrill = (clicked: ClickObject): ChartDrill | null => {
      const point = getDrillPoint(clicked);
      const label = point && describePoint(point);
      return point && label
        ? { point, label, count: getDrillCount(clicked, countColumn) }
        : null;
    };

    return {
      actionsForClick: (clicked) => {
        const actions: ClickAction[] = getExtraActions?.(clicked) ?? [];
        const drill = canDrill ? getDrill(clicked) : null;
        if (drill === null) {
          return actions;
        }
        actions.push(
          {
            name: "product-analytics.see-members",
            type: "custom",
            section: "custom",
            buttonType: "horizontal",
            icon: "list",
            title: getSeeMembersTitle(grain),
            onClick: ({ closePopover }) => {
              closePopover();
              setModal({ type: "members", drill });
            },
          },
          {
            name: "product-analytics.start-analysis",
            section: "custom",
            buttonType: "horizontal",
            icon: "sparkles",
            title: getStartAnalysisTitle(grain),
            popover: ({ onClose }) => (
              <NewAnalysisPopover
                onSelect={(kind) => startAnalysis(kind, drill)}
                onClose={onClose}
              />
            ),
          },
          {
            name: "product-analytics.save-segment",
            type: "custom",
            section: "custom",
            buttonType: "horizontal",
            icon: "segment",
            title: getSaveSegmentTitle(grain),
            onClick: ({ closePopover }) => {
              closePopover();
              setModal({ type: "segment", drill });
            },
          },
        );
        if (breakoutQuery !== undefined) {
          actions.push({
            name: "product-analytics.breakout",
            section: "custom",
            buttonType: "horizontal",
            icon: "external",
            title: t`Break this count out by…`,
            popover: ({ onClose }) => (
              <BreakoutPopover
                query={breakoutQuery}
                onSelect={(column) => breakout(column, drill)}
                onClose={onClose}
              />
            ),
          });
        }
        return actions;
      },
    };
  }, [
    canDrill,
    grain,
    countColumn,
    describePoint,
    getExtraActions,
    startAnalysis,
    breakout,
    breakoutQuery,
  ]);

  return {
    mode,
    modal,
    closeModal: () => setModal(null),
    /** Lets a drill's navigation through the unsaved-changes guard. */
    isDrilling: () => isDrillingRef.current,
    toCohort,
  };
};
