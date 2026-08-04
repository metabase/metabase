import { type ReactNode, createContext, useContext } from "react";

import { useUnresolvedCommentsCount } from "metabase/comments/hooks/use-unresolved-comments-count";
import { documentEditorHost } from "metabase/documents/components/Editor/DocumentEditorHost";
import type { EditorHost } from "metabase/rich_text_editing/tiptap/EditorHost";
import type { ExplorationId } from "metabase-types/api";

const ExplorationIdContext = createContext<ExplorationId | null>(null);

function useUnresolvedExplorationCommentsCount(
  childTargetId: string,
  { skip = false }: { skip?: boolean } = {},
) {
  const explorationId = useContext(ExplorationIdContext);
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

/**
 * Document editor host wired for an exploration Summary: comments resolve
 * against `target_type: "exploration"` so cardEmbeds (keyed by page id) and
 * prose blocks (keyed by `_id` uuid) share the exploration comment stream.
 *
 * Must be rendered under {@link ExplorationIdProvider} so the comment hooks
 * can resolve the exploration id.
 */
export const explorationEditorHost: EditorHost = {
  ...documentEditorHost,
  capabilities: {
    canEmbedCharts: false,
    canUseMetabot: false,
    canOpenCardInQueryBuilder: false,
  },
  useUnresolvedCommentsCount: useUnresolvedExplorationCommentsCount,
};

/** Supplies the exploration id that {@link explorationEditorHost} comment hooks read. */
export function ExplorationIdProvider({
  explorationId,
  children,
}: {
  explorationId: ExplorationId;
  children: ReactNode;
}) {
  return (
    <ExplorationIdContext.Provider value={explorationId}>
      {children}
    </ExplorationIdContext.Provider>
  );
}
