import { forwardRef } from "react";
import { P, match } from "ts-pattern";

import type {
  BareSuggestionRendererProps,
  BareSuggestionRendererRef,
} from "metabase/rich_text_editing/tiptap/extensions/suggestionRenderer";

import {
  type DraftState,
  findDraftStartingAt,
  getStageAt,
  readDraft,
} from "../../editor";
import type { ConnectorToken } from "../../model";
import type { ColumnItem, FilterBarAdapter, FilterOperator } from "../../types";
import { ColumnPopup } from "../ColumnPopup/ColumnPopup";
import { OperatorPopup } from "../OperatorPopup/OperatorPopup";

export type DraftPick<F> =
  | ColumnItem<F>
  | { type: "operator"; operator: FilterOperator }
  | { type: "connector"; connector: ConnectorToken["type"] };

const NEW_DRAFT: Pick<DraftState, "step" | "column"> = {
  step: "column",
  column: null,
};

const getTypedConnector = (query: string): ConnectorToken["type"] | null =>
  match(query.trim().toLowerCase())
    .with("and", "or", (type) => type)
    .otherwise(() => null);

export const createDraftPopup = <F,>(getAdapter: () => FilterBarAdapter<F>) =>
  forwardRef<
    BareSuggestionRendererRef,
    BareSuggestionRendererProps<DraftPick<F>, DraftPick<F>>
  >(function DraftPopup({ editor, range, query, clientRect, command }, ref) {
    const draft = findDraftStartingAt(editor.state.doc, range.from);
    const caretStage = getStageAt(editor.state.doc, range.from);
    return match(draft ? readDraft(draft) : NEW_DRAFT)
      .with({ step: "column" }, () => (
        <ColumnPopup
          groups={getAdapter().stage(caretStage).columnGroups()}
          query={query}
          getAnchorRect={clientRect}
          handle={ref}
          connector={getTypedConnector(query)}
          onPick={command}
          onPickConnector={(connector) =>
            command({ type: "connector", connector })
          }
        />
      ))
      .with(
        { step: "operator", column: P.nonNullable },
        ({ column: { column, stage } }) => (
          <OperatorPopup
            operators={getAdapter().stage(stage).operators(column) ?? []}
            query={query}
            getAnchorRect={clientRect}
            handle={ref}
            onPick={(operator) => command({ type: "operator", operator })}
          />
        ),
      )
      .otherwise(() => null);
  });
