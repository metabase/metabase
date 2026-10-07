import { parse } from "url";

import { createMockMetadata } from "__support__/metadata";
import { deserializeCardFromUrl } from "metabase/common/utils/card";
import type { ClickObject } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  ClickBehaviorParameterMapping,
} from "metabase-types/api";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getClickBehaviorTarget } from "./EmbeddingSdkMode";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const metadataProvider = Lib.metadataProvider(SAMPLE_DB_ID, metadata);
const sourceQuestion = new Question(createMockCard(), metadata);

const categoryColumn = createMockColumn({ name: "CATEGORY" });

// A dashcard click behavior that links to `targetCard`, mapping the clicked
// "Gizmo" category value through `parameterMapping`.
function buildQuestionLinkClicked({
  targetId,
  targetCard,
  parameterMapping,
}: {
  targetId: CardId;
  targetCard: Card;
  parameterMapping: ClickBehaviorParameterMapping;
}): ClickObject {
  return {
    settings: {
      click_behavior: {
        type: "link",
        linkType: "question",
        targetId,
        parameterMapping,
      },
    },
    dimensions: [{ column: categoryColumn, value: "Gizmo" }],
    extraData: { questions: { [targetId]: targetCard } },
  };
}

function parseAdHocQuestionPath(path: string): Card | null {
  const { hash } = parse(path, true);
  return hash ? deserializeCardFromUrl(hash) : null;
}

describe("getClickBehaviorTarget", () => {
  it("builds an ad-hoc question target with the filter for a GUI (MBQL) target question", () => {
    const targetCard = createMockCard({
      id: 5,
      name: "Products (drill target)",
      dataset_query: Lib.toJsQuery(
        Lib.fromJsQuery(metadataProvider, {
          type: "query",
          query: { "source-table": PRODUCTS_ID },
          database: SAMPLE_DB_ID,
        }),
      ),
    });

    // parameterMapping is keyed by the target's own stringified id.
    const dimensionTargetId = JSON.stringify([
      "dimension",
      ["field", PRODUCTS.CATEGORY, null],
    ]);

    const clicked = buildQuestionLinkClicked({
      targetId: 5,
      targetCard,
      parameterMapping: {
        [dimensionTargetId]: {
          id: dimensionTargetId,
          source: { type: "column", id: "CATEGORY", name: "Category" },
          target: {
            id: dimensionTargetId,
            type: "dimension",
            dimension: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
          },
        },
      },
    });

    const target = getClickBehaviorTarget(clicked, sourceQuestion);

    expect(target?.type).toBe("ad-hoc-question");
    if (target?.type !== "ad-hoc-question") {
      throw new Error("expected an ad-hoc question target");
    }

    const card = parseAdHocQuestionPath(target.adHocQuestionPath);
    expect(card).not.toBeNull();

    const query = Lib.fromJsQuery(metadataProvider, card!.dataset_query);
    const [filter] = Lib.filters(query, -1);

    expect(Lib.displayInfo(query, -1, filter).longDisplayName).toBe(
      "Category is Gizmo",
    );
  });

  it("keeps a native target question as a saved-question target", () => {
    const targetCard = createMockCard({
      id: 6,
      name: "Native drill target",
      dataset_query: {
        type: "native",
        database: SAMPLE_DB_ID,
        native: {
          query: "select * from products where category = {{category}}",
          "template-tags": {
            category: {
              id: "tag-1",
              name: "category",
              "display-name": "Category",
              type: "text",
            },
          },
        },
      },
    });

    const clicked = buildQuestionLinkClicked({
      targetId: 6,
      targetCard,
      parameterMapping: {
        "variable-target": {
          id: "variable-target",
          source: { type: "column", id: "CATEGORY", name: "Category" },
          target: { id: "category", type: "variable" },
        },
      },
    });

    const target = getClickBehaviorTarget(clicked, sourceQuestion);

    expect(target?.type).toBe("question");
    if (target?.type !== "question") {
      throw new Error("expected a question target");
    }

    expect(target.id).toBe(6);
    expect(target.parameters).toEqual({ category: "Gizmo" });
  });
});
