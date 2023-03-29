import React from "react";

import { renderWithProviders, screen } from "__support__/ui";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";

import { createMockUser } from "metabase-types/api/mocks";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

import Question from "metabase-lib/Question";
import QuestionModerationButton from "./QuestionModerationButton";

const VERIFIED_ICON_LABEL = "verified icon";
const CLOSE_ICON_LABEL = "close icon";

const BASE_QUESTION = {
  id: 1,
  name: "Q1",
  description: null,
  collection_id: null,
  can_write: true,
  dataset: true,
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
  moderation_reviews: [],
};

function getVerifiedDataset() {
  return new Question(
    {
      ...BASE_QUESTION,
      moderation_reviews: [
        {
          status: "verified",
          moderator_id: 1,
          created_at: Date.now(),
          most_recent: true,
        },
      ],
    },
    metadata,
  );
}

function getUnverifiedDataset() {
  return new Question(
    {
      ...BASE_QUESTION,
      moderation_reviews: [
        {
          status: null,
          moderator_id: 1,
          created_at: Date.now(),
          most_recent: true,
        },
      ],
    },
    metadata,
  );
}

function setup({ question } = {}) {
  const card = getVerifiedDataset();
  const state = {
    currentUser: createMockUser({ is_superuser: true }),
    qb: createMockQueryBuilderState({ card }),
  };

  return renderWithProviders(<QuestionModerationButton question={question} />, {
    withSampleDatabase: true,
    storeInitialState: state,
  });
}

describe("ModerationReviewButton", () => {
  describe("It should render correct text based on review status", () => {
    it("verified", () => {
      setup({ question: getVerifiedDataset() });
      expect(screen.getByText("Remove verification")).toBeInTheDocument();
      expect(screen.getByLabelText(CLOSE_ICON_LABEL)).toBeInTheDocument();
    });

    it("not verified", () => {
      setup({ question: getUnverifiedDataset() });
      expect(screen.getByText("Verify this model")).toBeInTheDocument();
      expect(screen.getByLabelText(VERIFIED_ICON_LABEL)).toBeInTheDocument();
    });
  });
});
