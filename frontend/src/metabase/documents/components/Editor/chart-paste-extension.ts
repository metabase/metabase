import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { parseChartClipboard } from "metabase/common/utils/chart-clipboard";
import {
  createDraftCard,
  generateDraftCardId,
} from "metabase/documents/documents.slice";
import { buildDraftCard } from "metabase/rich_text_editing/tiptap/extensions/shared/draft-card";
import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";

type DispatchDraftCard = (action: ReturnType<typeof createDraftCard>) => void;

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
      originalCard: buildDraftCard({
        id: draftId,
        name: payload.name,
        display: payload.display,
        dataset_query: payload.dataset_query,
        visualization_settings: payload.visualization_settings,
        description: payload.description,
        database_id: payload.dataset_query.database ?? undefined,
      }),
      modifiedData: {},
      draftId,
    }),
  );
  return wrapCardEmbed({ type: "cardEmbed", attrs: { id: draftId } });
}

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
