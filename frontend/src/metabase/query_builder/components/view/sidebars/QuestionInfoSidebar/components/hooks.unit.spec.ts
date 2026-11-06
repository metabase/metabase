import { renderHook } from "@testing-library/react";

import { createMockMetadata } from "__support__/metadata";
import type { IconModel } from "metabase/common/utils/icon";
import * as Lib from "metabase-lib";
import { createMetadataProvider } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useGetJoinedTablesWithIcons } from "./hooks";

jest.mock("metabase/hooks/use-icon", () => {
  const { modelIconMap } = jest.requireActual("metabase/common/utils/icon");
  return {
    useGetIcon: () =>
      jest.fn((item: { model: IconModel }) => ({
        name: modelIconMap[item.model] ?? "unknown",
      })),
  };
});

const joinedCard = createMockCard({
  name: "Joined Card",
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [joinedCard],
});

const cardWithoutJoins = createMockCard();

const cardWithJoins = createMockCard({
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(createMetadataProvider({ metadata }), {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          joins: [
            {
              source: { type: "card", id: joinedCard.id },
              strategy: "left-join",
              conditions: [
                {
                  operator: "=",
                  left: { type: "column", name: "ID" },
                  right: { type: "column", name: "ID" },
                },
              ],
            },
          ],
        },
      ],
    }),
  ),
});

const questionWithJoins = new Question(cardWithJoins, metadata);

const questionWithoutJoins = new Question(cardWithoutJoins, metadata);

describe("QuestionInfoSidebar component hooks", () => {
  describe("useGetJoinedTablesWithIcons", () => {
    it("retrieves one joined table", () => {
      const { result } = renderHook(() => useGetJoinedTablesWithIcons());
      const actual = result.current(questionWithJoins);
      expect(actual).toEqual([
        {
          name: "Joined Card",
          href: "/question/1-joined-card",
          iconProps: { name: "table" },
        },
      ]);
    });

    it("returns [] if there are no joined tables", () => {
      const { result } = renderHook(() => useGetJoinedTablesWithIcons());
      const actual = result.current(questionWithoutJoins);
      expect(actual).toEqual([]);
    });
  });
});
