import {
  trackNodeBuilderBlockAdded,
  trackNodeBuilderBlockRemoved,
  trackNodeBuilderOpened,
  trackNodeBuilderQuerySynced,
  trackNodeBuilderToggled,
  trackNodeBuilderWireConnected,
  trackNodeBuilderWireRejected,
} from "./analytics";

jest.mock("metabase/analytics", () => ({
  trackSimpleEvent: jest.fn(),
}));

const { trackSimpleEvent: mockTrackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

describe("node builder analytics", () => {
  beforeEach(() => {
    mockTrackSimpleEvent.mockClear();
  });

  it("reports the toggle state and the question", () => {
    trackNodeBuilderToggled(true, 42);
    expect(mockTrackSimpleEvent).toHaveBeenCalledWith({
      event: "node_builder_toggled",
      event_detail: "on",
      target_id: 42,
    });
  });

  it("tells a new question from a saved one on open", () => {
    trackNodeBuilderOpened(null);
    trackNodeBuilderOpened(7);
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(1, {
      event: "node_builder_opened",
      event_detail: "new",
      target_id: null,
    });
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(2, {
      event: "node_builder_opened",
      event_detail: "existing",
      target_id: 7,
    });
  });

  it("reports the block kind and where it was removed from", () => {
    trackNodeBuilderBlockAdded("filter", "drag");
    trackNodeBuilderBlockRemoved("join", "keyboard");
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(1, {
      event: "node_builder_block_added",
      event_detail: "filter",
      triggered_from: "drag",
    });
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(2, {
      event: "node_builder_block_removed",
      event_detail: "join",
      triggered_from: "keyboard",
    });
  });

  it("describes a wire by both ends", () => {
    trackNodeBuilderWireConnected("table", "filter", "connect");
    trackNodeBuilderWireRejected("summarize", "table");
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(1, {
      event: "node_builder_wire_connected",
      event_detail: "table_to_filter",
      triggered_from: "connect",
    });
    expect(mockTrackSimpleEvent).toHaveBeenNthCalledWith(2, {
      event: "node_builder_wire_rejected",
      event_detail: "summarize_to_table",
    });
  });

  it("reports the stage count as the sync detail", () => {
    trackNodeBuilderQuerySynced(2);
    expect(mockTrackSimpleEvent).toHaveBeenCalledWith({
      event: "node_builder_query_synced",
      event_detail: "2",
    });
  });
});
