import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { t } from "ttag";

import {
  type ChartClipboardPayload,
  parseChartClipboard,
} from "metabase/common/utils/chart-clipboard";
import {
  createDraftCard,
  generateDraftCardId,
} from "metabase/documents/documents.slice";
import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";
import type { Card } from "metabase-types/api";

type DispatchDraftCard = (action: ReturnType<typeof createDraftCard>) => void;

function buildDraftCard(payload: ChartClipboardPayload, draftId: number): Card {
  return {
    id: draftId,
    name: payload.name || t`Chart`,
    display: payload.display,
    dataset_query: payload.dataset_query,
    visualization_settings: payload.visualization_settings,
    database_id: payload.dataset_query.database ?? undefined,
    entity_id: "" as Card["entity_id"],
    created_at: "",
    updated_at: "",
    description: null,
    type: "question",
    public_uuid: null,
    enable_embedding: false,
    embedding_params: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
    can_manage_db: false,
    initially_published_at: null,
    collection_id: null,
    collection_position: null,
    dashboard: null,
    dashboard_id: null,
    dashboard_count: null,
    result_metadata: [],
    last_query_start: null,
    average_query_time: null,
    cache_ttl: null,
    archived: false,
  };
}

/**
 * If `text` is a copied Metabot chart, registers it as a redux-only draft card
 * and returns the `cardEmbed` node to insert. Returns null otherwise.
 */
export function materializePastedChart(
  text: string | null | undefined,
  dispatch: DispatchDraftCard,
): JSONContent | null {
  const payload = parseChartClipboard(text);
  if (!payload) {
    return null;
  }
  const draftId = generateDraftCardId();
  dispatch(
    createDraftCard({
      originalCard: buildDraftCard(payload, draftId),
      modifiedData: {},
      draftId,
    }),
  );
  return wrapCardEmbed({ type: "cardEmbed", attrs: { id: draftId } });
}

/**
 * Lets the user paste a copied Metabot chart (see `chart-clipboard`) into a
 * document: the ad-hoc chart becomes a redux-only draft card and is inserted as
 * a `cardEmbed`, without persisting a saved card.
 */
export function createChartPasteExtension(dispatch: DispatchDraftCard) {
  return Extension.create({
    name: "chartPaste",

    addProseMirrorPlugins() {
      const { editor } = this;

      return [
        new Plugin({
          props: {
            handlePaste: (_view, event) => {
              if (!editor.isEditable) {
                return false;
              }
              const node = materializePastedChart(
                event.clipboardData?.getData("text/plain"),
                dispatch,
              );
              if (!node) {
                return false;
              }
              editor.commands.insertContent(node);
              return true;
            },
          },
        }),
      ];
    },
  });
}
