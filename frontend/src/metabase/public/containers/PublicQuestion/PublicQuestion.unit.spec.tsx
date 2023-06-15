import { Route } from "react-router";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  setupPublicCardQueryEndpoints,
  setupPublicQuestionEndpoints,
} from "__support__/server-mocks/public";
import { createMockState } from "metabase-types/store/mocks";
import {
  createMockPublicCard,
  createMockPublicDataset,
} from "metabase-types/api/mocks";

import { PublicQuestion } from "./PublicQuestion";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

async function setup() {
  setupPublicQuestionEndpoints(
    FAKE_UUID,
    createMockPublicCard({ name: QUESTION_NAME }),
  );
  setupPublicCardQueryEndpoints(
    FAKE_UUID,
    createMockPublicDataset({
      data: { rows: [["John W."]] },
    }),
  );

  renderWithProviders(
    <Route path="public/question/:uuid" component={PublicQuestion} />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: `public/question/${FAKE_UUID}`,
    },
  );
  expect(await screen.findByText(QUESTION_NAME)).toBeInTheDocument();
}

describe("PublicQuestion", () => {
  it("should render data", async () => {
    await setup();
    expect(screen.getByText("John W.")).toBeInTheDocument();
  });

  it("should not database prompt banner", async () => {
    await setup();

    // Since database prompt banner render as a banner. If we only find one banner
    // that is showing the question name, we know that the database prompt banner is not showing.
    expect(
      within(screen.getByRole("banner")).getByText(QUESTION_NAME),
    ).toBeInTheDocument();
  });
});
