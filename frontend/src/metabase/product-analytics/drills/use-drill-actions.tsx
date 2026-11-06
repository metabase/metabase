import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ClickAction,
  ClickActionsMode,
  ClickObject,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";

import { BreakoutPopover } from "../components/drills/BreakoutPopover";
import type { CohortFilter } from "../filters";
import type { DrillPoint } from "../sql/compose";

import { getDrillCount, getDrillPoint } from "./describe";
import { getSeeMembersTitle } from "./labels";
import type { ChartDrill } from "./types";
import type { DrillQueries } from "./use-drill-queries";

const STAGE = -1;

type UseDrillActionsArgs = {
  /** The chart's count column, e.g. "people". */
  countColumn: string;
  describePoint: (point: DrillPoint) => string | null;
  queries: DrillQueries;
};

/**
 * The click actions on an analysis's chart. Both open the query builder on
 * the clicked actors.
 */
export const useDrillActions = ({
  countColumn,
  describePoint,
  queries,
}: UseDrillActionsArgs) => {
  const navigate = useNavigate();
  const [sendToast] = useToast();
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
  const {
    grain,
    fetchMemberIds,
    buildMembersQuery,
    buildCohortEventsQuery,
    canDrill,
  } = queries;

  const toCohort = useCallback(
    async (drill: ChartDrill): Promise<CohortFilter> => ({
      label: drill.label,
      grain,
      ids: await fetchMemberIds(drill.point),
    }),
    [grain, fetchMemberIds],
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

  // The clicked actors as a table in the query builder.
  const seeMembers = useCallback(
    async (drill: ChartDrill) => {
      try {
        const query = buildMembersQuery(await toCohort(drill));
        navigateAway(
          Urls.serializedQuestion({
            display: "table",
            dataset_query: Lib.toJsQuery(query),
            visualization_settings: {},
          }),
        );
      } catch (error) {
        sendToast({
          icon: "warning",
          message:
            error instanceof Error
              ? error.message
              : t`These can't be opened right now.`,
        });
      }
    },
    [buildMembersQuery, toCohort, navigateAway, sendToast],
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
        const drill = canDrill ? getDrill(clicked) : null;
        if (drill === null) {
          return [];
        }
        const actions: ClickAction[] = [
          {
            name: "product-analytics.see-members",
            type: "custom",
            section: "custom",
            buttonType: "horizontal",
            icon: "list",
            title: getSeeMembersTitle(grain),
            onClick: ({ closePopover }) => {
              closePopover();
              seeMembers(drill);
            },
          },
        ];
        if (breakoutQuery !== undefined) {
          actions.push({
            name: "product-analytics.breakout",
            section: "custom",
            buttonType: "horizontal",
            icon: "arrow_split",
            title: t`Break out by…`,
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
    seeMembers,
    breakout,
    breakoutQuery,
  ]);

  return {
    mode,
    /** Lets a drill's navigation through the unsaved-changes guard. */
    isDrilling: () => isDrillingRef.current,
  };
};
