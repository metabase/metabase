import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockSnippetDependencyNode,
  createMockTableDependencyNode,
  createMockTransformDependencyNode,
} from "metabase-types/api/mocks";

import { getNodeIcon } from "./utils";

registerVisualizations();

describe("getNodeIcon", () => {
  it.each<{
    node: DependencyNode;
    icon: IconName;
  }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          display: "pie",
        }),
      }),
      icon: "pie",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "model",
          display: "table",
        }),
      }),
      icon: "model",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "metric",
          display: "scalar",
        }),
      }),
      icon: "metric",
    },
    {
      node: createMockTableDependencyNode(),
      icon: "table",
    },
    {
      node: createMockTransformDependencyNode(),
      icon: "refresh_downstream",
    },
    {
      node: createMockSnippetDependencyNode(),
      icon: "sql",
    },
  ])("should get the node icon", ({ node, icon }) => {
    expect(getNodeIcon(node)).toBe(icon);
  });
});
