import * as Analytics from "metabase/analytics";
import type { CollectionItem } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { handleItemDrop } from "./handle-item-drop";

const question = createMockCollectionItem({
  id: 1,
  model: "card",
  collection_position: null,
});
const dashboard = createMockCollectionItem({
  id: 2,
  model: "dashboard",
  collection_position: null,
});

function setup(items: CollectionItem[] = [question]) {
  return {
    items,
    setCollection: jest.fn().mockResolvedValue(undefined),
    setPinned: jest.fn().mockResolvedValue({ data: {} }),
  };
}

describe("handleItemDrop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tracks each item moved to a collection with drag and drop", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const props = setup([question, dashboard]);
    const collection = createMockCollection({ id: 10 });

    await handleItemDrop({
      ...props,
      dropResult: { collection },
    });

    expect(props.setCollection).toHaveBeenCalledTimes(2);
    expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_item_moved",
      event_detail: "question",
      target_id: question.id,
      triggered_from: "drag_and_drop",
      result: "success",
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_item_moved",
      event_detail: "dashboard",
      target_id: dashboard.id,
      triggered_from: "drag_and_drop",
      result: "success",
    });
  });

  it("tracks failed collection moves and preserves the rejection", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const props = setup();
    const error = new Error("Move failed");
    props.setCollection.mockRejectedValue(error);

    await expect(
      handleItemDrop({
        ...props,
        dropResult: { collection: createMockCollection({ id: 10 }) },
      }),
    ).rejects.toBe(error);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_item_moved",
      event_detail: "question",
      target_id: question.id,
      triggered_from: "drag_and_drop",
      result: "failure",
    });
  });

  it("reuses moved-to-trash analytics for a trash drop", async () => {
    const trackSchemaEvent = jest.spyOn(Analytics, "trackSchemaEvent");
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const props = setup();

    await handleItemDrop({
      ...props,
      dropResult: {
        collection: createMockCollection({ id: "trash", type: "trash" }),
      },
    });

    expect(trackSimpleEvent).not.toHaveBeenCalled();
    expect(trackSchemaEvent).toHaveBeenCalledWith("simple_event", {
      event: "moved-to-trash",
      event_detail: "question",
      target_id: question.id,
      triggered_from: "drag_and_drop",
      duration_ms: expect.any(Number),
      result: "success",
    });
  });

  it("tracks pinning and unpinning but not pinned-item reordering", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const pinProps = setup();
    await handleItemDrop({
      ...pinProps,
      dropResult: { pinIndex: 1 },
    });
    expect(pinProps.setPinned).toHaveBeenCalledWith(question, 1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_item_pinned",
      event_detail: "question",
      target_id: question.id,
      triggered_from: "drag_and_drop",
      result: "success",
    });

    const pinnedDashboard = {
      ...dashboard,
      collection_position: 1,
    };
    const unpinProps = setup([pinnedDashboard]);
    unpinProps.setPinned.mockResolvedValue({ error: {} });
    await handleItemDrop({
      ...unpinProps,
      dropResult: { pinIndex: null },
    });
    expect(unpinProps.setPinned).toHaveBeenCalledWith(pinnedDashboard, false);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "collection_item_unpinned",
      event_detail: "dashboard",
      target_id: pinnedDashboard.id,
      triggered_from: "drag_and_drop",
      result: "failure",
    });

    trackSimpleEvent.mockClear();
    const reorderProps = setup([pinnedDashboard]);
    await handleItemDrop({
      ...reorderProps,
      dropResult: { pinIndex: 2 },
    });
    expect(reorderProps.setPinned).toHaveBeenCalledWith(pinnedDashboard, 2);
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });
});
