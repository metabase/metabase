import type { IconName } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import type { DependencyNode } from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockSegmentDependencyNode,
  createMockSnippetDependencyNode,
  createMockTableDependencyNode,
  createMockTableDependencyNodeData,
  createMockTransformDependencyNode,
} from "metabase-types/api/mocks";

import type { NodeLink } from "./types";
import { getNodeIcon, getNodeLink } from "./utils";

registerVisualizations();

describe("getNodeIcon", () => {
  it.each<{
    node: DependencyNode;
    expectedIcon: IconName;
  }>([
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "question",
          display: "pie",
        }),
      }),
      expectedIcon: "pie",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "model",
          display: "table",
        }),
      }),
      expectedIcon: "model",
    },
    {
      node: createMockCardDependencyNode({
        data: createMockCardDependencyNodeData({
          type: "metric",
          display: "scalar",
        }),
      }),
      expectedIcon: "metric",
    },
    {
      node: createMockTableDependencyNode(),
      expectedIcon: "table",
    },
    {
      node: createMockTransformDependencyNode(),
      expectedIcon: "transform",
    },
    {
      node: createMockSnippetDependencyNode(),
      expectedIcon: "sql",
    },
  ])("should get the node icon", ({ node, expectedIcon }) => {
    expect(getNodeIcon(node)).toBe(expectedIcon);
  });
});

describe("getNodeLink", () => {
  it.each<{
    node: DependencyNode;
    expectedLink: NodeLink;
  }>([
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "question",
          name: "My question",
        }),
      }),
      expectedLink: {
        label: "View this question",
        url: "/question/1-my-question",
      },
    },
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "model",
          name: "My model",
        }),
      }),
      expectedLink: {
        label: "View this model",
        url: "/model/1-my-model",
      },
    },
    {
      node: createMockCardDependencyNode({
        id: 1,
        data: createMockCardDependencyNodeData({
          type: "metric",
          name: "My metric",
        }),
      }),
      expectedLink: {
        label: "View this metric",
        url: "/metric/1-my-metric",
      },
    },
    {
      node: createMockTableDependencyNode({
        id: 1,
        data: createMockTableDependencyNodeData({
          db_id: 2,
          schema: "not public",
        }),
      }),
      expectedLink: {
        label: "View metadata",
        url: "/admin/datamodel/database/2/schema/2:not%20public/table/1",
      },
    },
    {
      node: createMockSegmentDependencyNode({
        id: 1,
      }),
      expectedLink: {
        label: "View this segment",
        url: "/admin/datamodel/segment/1",
      },
    },
  ])("should get the node link", ({ node, expectedLink }) => {
    expect(getNodeLink(node)).toEqual(expectedLink);
  });
});
