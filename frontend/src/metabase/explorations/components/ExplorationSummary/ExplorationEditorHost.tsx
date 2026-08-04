import { useMemo, useState } from "react";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { documentEditorHost } from "metabase/documents/components/Editor/DocumentEditorHost";
import { useExplorationClickActionsMode } from "metabase/explorations/hooks/useExplorationClickActionsMode";
import {
  getCurrentExploration,
  getHighlightedForChildTarget,
  getQueriesById,
} from "metabase/explorations/selectors";
import type { CommentDrafts } from "metabase/explorations/types";
import { useSelector } from "metabase/redux";
import type { EditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import type { HighlightedObject } from "metabase/visualizations/types";
import type { ExplorationQueryId, Series } from "metabase-types/api";

import { resolveHighlightForSeries } from "../ExplorationVisualization/utils";

function useUnresolvedExplorationCommentsCount(
  childTargetId: string,
  { skip = false }: { skip?: boolean } = {},
) {
  const exploration = useSelector(getCurrentExploration);
  const explorationId = exploration?.id;
  const { unresolvedCommentsCount } = useUnresolvedCommentsCount({
    target:
      explorationId != null
        ? {
            target_id: explorationId,
            target_type: "exploration",
          }
        : undefined,
    childTargetId,
    skip: skip || explorationId == null,
  });
  return unresolvedCommentsCount;
}

function parseHostQueryIds(
  hostData: Record<string, unknown> | null | undefined,
): ExplorationQueryId[] {
  const raw = hostData?.query_ids;
  if (
    !Array.isArray(raw) ||
    !raw.every((id): id is number => typeof id === "number")
  ) {
    return [];
  }
  return raw;
}

function useExplorationHighlighted(
  childTargetId: string,
  series: Series | null,
  hostData?: Record<string, unknown> | null,
): HighlightedObject | null {
  const highlightedCommentState = useSelector((state) =>
    getHighlightedForChildTarget(state, childTargetId),
  );
  const queriesById = useSelector(getQueriesById);
  const seriesQueryIds = useMemo(() => parseHostQueryIds(hostData), [hostData]);
  return useMemo(
    () =>
      resolveHighlightForSeries(
        highlightedCommentState,
        series ?? [],
        seriesQueryIds,
        queriesById,
      ),
    [highlightedCommentState, series, seriesQueryIds, queriesById],
  );
}

function useExplorationVisualizationMode({
  childTargetId,
  hostData,
}: {
  childTargetId: string;
  hostData?: Record<string, unknown> | null;
}) {
  const exploration = useSelector(getCurrentExploration);
  const queriesById = useSelector(getQueriesById);
  const seriesQueryIds = useMemo(() => parseHostQueryIds(hostData), [hostData]);
  const parsedPageId = Number(childTargetId);
  const [commentDrafts, setCommentDrafts] = useState<CommentDrafts>({});

  return useExplorationClickActionsMode({
    explorationId: exploration?.id,
    pageId: Number.isFinite(parsedPageId) ? parsedPageId : undefined,
    commentDrafts,
    setCommentDrafts,
    seriesQueryIds,
    queriesById,
  });
}

/**
 * Document editor host wired for an exploration Summary: comments resolve
 * against `target_type: "exploration"` so cardEmbeds (keyed by page id) and
 * prose blocks (keyed by `_id` uuid) share the exploration comment stream.
 */
export const explorationEditorHost: EditorHost = {
  ...documentEditorHost,
  capabilities: {
    canEmbedCharts: false,
    canUseMetabot: false,
    canOpenCardInQueryBuilder: false,
  },
  useUnresolvedCommentsCount: useUnresolvedExplorationCommentsCount,
  useHighlighted: useExplorationHighlighted,
  useVisualizationMode: useExplorationVisualizationMode,
};
