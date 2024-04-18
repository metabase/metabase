import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockConfig } from "embedding-sdk/test/mocks/config";
import { getSdkTestSetup } from "embedding-sdk/test/server-mocks/base";
import {
  createMockCard,
  createMockDataset,
  createMockUser,
} from "metabase-types/api/mocks";

import { StaticQuestion } from "./StaticQuestion";

const TEST_QUESTION_ID = 1;
const TEST_CARD = createMockCard({
  id: TEST_QUESTION_ID,
});

const setup = ({
  isLoggedIn = false,
  loginStatus = {
    status: "success",
  },
} = {}) => {
  setupCardEndpoints(TEST_CARD);

  setupCardQueryEndpoints(TEST_CARD, createMockDataset());

  const state = getSdkTestSetup({
    currentUser: createMockUser(),
  });

  renderWithProviders(<StaticQuestion questionId={TEST_QUESTION_ID} />, {
    config: createMockConfig(),
    mode: "sdk",
    storeInitialState: state,
  });
};

describe("StaticQuestion", () => {
  it("should display an error if login is unsuccessful", async () => {
    setup();

    expect(await screen.findByText("Loading…")).not.toBeInTheDocument();

    screen.debug(undefined, 100000);
  });

  it("should display an error message if the user is not logged in", () => {});

  it("should display a question if the user is logged in", () => {});
});
