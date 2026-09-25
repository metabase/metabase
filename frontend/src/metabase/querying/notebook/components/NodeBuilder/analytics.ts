import { trackSimpleEvent } from "metabase/analytics";
import type { CardId } from "metabase-types/api";

import type { BuilderNode, SourceKind } from "./types";

export type BlockKind = NonNullable<BuilderNode["type"]>;
export type BlockAddedTrigger = "drag" | "click";
export type BlockRemovedTrigger = "header" | "keyboard";
export type WireTrigger = "connect" | "reconnect";
export type HistoryAction = "undo" | "redo";
export type HistoryTrigger = "toolbar" | "keyboard";
export type CollapseAction = "collapse" | "expand";

export const trackNodeBuilderToggled = (
  isOn: boolean,
  questionId: CardId | null,
) => {
  trackSimpleEvent({
    event: "node_builder_toggled",
    event_detail: isOn ? "on" : "off",
    target_id: questionId,
  });
};

export const trackNodeBuilderOpened = (questionId: CardId | null) => {
  trackSimpleEvent({
    event: "node_builder_opened",
    event_detail: questionId == null ? "new" : "existing",
    target_id: questionId,
  });
};

export const trackNodeBuilderBlockAdded = (
  kind: BlockKind,
  triggeredFrom: BlockAddedTrigger,
) => {
  trackSimpleEvent({
    event: "node_builder_block_added",
    event_detail: kind,
    triggered_from: triggeredFrom,
  });
};

export const trackNodeBuilderBlockRemoved = (
  kind: BlockKind,
  triggeredFrom: BlockRemovedTrigger,
) => {
  trackSimpleEvent({
    event: "node_builder_block_removed",
    event_detail: kind,
    triggered_from: triggeredFrom,
  });
};

export const trackNodeBuilderBlockEdited = (kind: BlockKind) => {
  trackSimpleEvent({
    event: "node_builder_block_edited",
    event_detail: kind,
  });
};

export const trackNodeBuilderSourcePicked = (kind: SourceKind) => {
  trackSimpleEvent({
    event: "node_builder_source_picked",
    event_detail: kind,
  });
};

export const trackNodeBuilderWireConnected = (
  from: BlockKind,
  to: BlockKind,
  triggeredFrom: WireTrigger,
) => {
  trackSimpleEvent({
    event: "node_builder_wire_connected",
    event_detail: `${from}_to_${to}`,
    triggered_from: triggeredFrom,
  });
};

// The wire was dropped on a handle the wiring rules refused.
export const trackNodeBuilderWireRejected = (
  from: BlockKind,
  to: BlockKind,
) => {
  trackSimpleEvent({
    event: "node_builder_wire_rejected",
    event_detail: `${from}_to_${to}`,
  });
};

export const trackNodeBuilderHistoryUsed = (
  action: HistoryAction,
  triggeredFrom: HistoryTrigger,
) => {
  trackSimpleEvent({
    event: "node_builder_history_used",
    event_detail: action,
    triggered_from: triggeredFrom,
  });
};

export const trackNodeBuilderCollapseToggled = (action: CollapseAction) => {
  trackSimpleEvent({
    event: "node_builder_collapse_toggled",
    event_detail: action,
  });
};

export const trackNodeBuilderPrettified = () => {
  trackSimpleEvent({ event: "node_builder_prettified" });
};

// One event per query the canvas actually pushes to the question.
export const trackNodeBuilderQuerySynced = (stageCount: number) => {
  trackSimpleEvent({
    event: "node_builder_query_synced",
    event_detail: String(stageCount),
  });
};
