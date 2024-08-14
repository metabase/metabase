import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  createMockState,
  createMockQueryBuilderState,
} from "metabase-types/store/mocks";

import QuestionModerationButton from "./QuestionModerationButton";

const VERIFIED_ICON_LABEL = "verified icon";
const CLOSE_ICON_LABEL = "close icon";

const BASE_MODEL = {
  id: 1,
  name: "Q1",
  description: null,
  collection_id: null,
  can_write: true,
  type: "model",
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
  moderation_reviews: [],
};

const VERIFIED_REVIEW = {
  status: "verified",
  moderator_id: 1,
  created_at: Date.now(),
  most_recent: true,
};

const UNVERIFIED_REVIEW = {
  status: null,
  moderator_id: 1,
  created_at: Date.now(),
  most_recent: true,
};

function getVerifiedModel() {
  return {
    ...BASE_MODEL,
    moderation_reviews: [VERIFIED_REVIEW],
  };
}

function getUnverifiedModel() {
  return {
    ...BASE_MODEL,
    moderation_reviews: [UNVERIFIED_REVIEW],
  };
}

function setup({ card } = {}) {
  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    qb: createMockQueryBuilderState({ card }),
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = metadata.question(card.id);

  return renderWithProviders(<QuestionModerationButton question={question} />, {
    storeInitialState: state,
  });
}

describe("ModerationReviewButton", () => {
  describe("It should render correct text based on review status", () => {
    it("verified", () => {
      setup({ card: getVerifiedModel() });
      expect(screen.getByText("Remove verification")).toBeInTheDocument();
      expect(screen.getByLabelText(CLOSE_ICON_LABEL)).toBeInTheDocument();
    });

    it("not verified", () => {
      setup({ card: getUnverifiedModel() });
      expect(screen.getByText("Verify this model")).toBeInTheDocument();
      expect(screen.getByLabelText(VERIFIED_ICON_LABEL)).toBeInTheDocument();
    });
  });
});
