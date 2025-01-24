import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getJoinedTablesWithIcons } from "./utils";

const joinedCard = createMockCard({
  name: "Joined Card",
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [joinedCard],
});

const cardWithoutJoins = createMockCard();

const cardWithJoins = createMockCard({
  dataset_query: {
    type: "query",
    query: {
      joins: [
        {
          ident: "ident",
          fields: "all",
          strategy: "left-join",
          alias: "joined table",
          condition: [
            "=",
            [
              "field",
              "Field A",
              {
                "base-type": "type/Text",
              },
            ],
            [
              "field",
              99,
              {
                "base-type": "type/Text",
                "join-alias": "Field A - Field B",
              },
            ],
          ],
          "source-table": `card__${joinedCard.id}`,
        },
      ],
    },
    database: SAMPLE_DB_ID,
  },
});

const questionWithJoins = new Question(cardWithJoins, metadata);

const questionWithoutJoins = new Question(cardWithoutJoins, metadata);

describe("QuestionInfoSidebar component utils", () => {
  describe("getJoinedTablesWithIcons", () => {
    it("retrieves one joined table", () => {
      const actual = getJoinedTablesWithIcons(questionWithJoins);
      expect(actual).toEqual([
        {
          name: "Joined Card",
          href: "/question/1-joined-card",
          iconProps: { name: "table" },
        },
      ]);
    });

    it("returns [] if there are no joined tables", () => {
      const actual = getJoinedTablesWithIcons(questionWithoutJoins);
      expect(actual).toEqual([]);
    });
  });
});
