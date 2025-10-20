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

import type { LinkWithTooltipInfo } from "./types";
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
      expectedIcon: "refresh_downstream",
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
    expectedLink: LinkWithTooltipInfo;
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
        url: "/question/1-my-question",
        tooltip: "View this question",
      },
    },
  ])("should get the node link", ({ node, expectedLink }) => {
    expect(getNodeLink(node)).toEqual(expectedLink);
  });
});
