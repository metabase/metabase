import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  createMockActionDependencyNode,
  createMockActionDependencyNodeData,
  createMockCollection,
  createMockSnippetDependencyNode,
} from "metabase-types/api/mocks";

import { getEntryPickerItem, getEntryPickerValue } from "./utils";

describe("getEntryPickerItem", () => {
  it("should select a snippet in the snippets namespace", () => {
    expect(
      getEntryPickerItem(createMockSnippetDependencyNode({ id: 3 })),
    ).toEqual({ id: 3, model: "snippet", namespace: "snippets" });
  });

  it("should select an action without a model in the data actions namespace", () => {
    const node = createMockActionDependencyNode({
      id: 4,
      data: createMockActionDependencyNodeData({ model_id: null }),
    });
    expect(getEntryPickerItem(node)).toEqual({
      id: 4,
      model: "action",
      namespace: "data-actions",
    });
  });

  it("should select an action without a model in a regular collection in the regular namespace", () => {
    const node = createMockActionDependencyNode({
      id: 6,
      data: createMockActionDependencyNodeData({
        model_id: null,
        collection: createMockCollection({ id: 7, namespace: null }),
      }),
    });
    expect(getEntryPickerItem(node)).toEqual({
      id: 6,
      model: "action",
      namespace: null,
    });
  });

  it("should select an action of a model in the regular namespace", () => {
    const node = createMockActionDependencyNode({
      id: 5,
      data: createMockActionDependencyNodeData({ model_id: 2 }),
    });
    expect(getEntryPickerItem(node)).toEqual({
      id: 5,
      model: "action",
      namespace: null,
    });
  });
});

describe("getEntryPickerValue", () => {
  it.each<{ item: OmniPickerItem; type: string }>([
    { item: { id: 3, model: "snippet", name: "Snippet" }, type: "snippet" },
    { item: { id: 4, model: "action", name: "Action" }, type: "action" },
  ])("should open the graph for a picked $type", ({ item, type }) => {
    expect(getEntryPickerValue(item)).toEqual({ id: item.id, type });
  });
});
