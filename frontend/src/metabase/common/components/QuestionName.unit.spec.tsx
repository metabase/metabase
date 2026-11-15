import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

import { QuestionName } from "./QuestionName";

const TEST_CARD = createMockCard({ name: "Sales overview" });

const renderName = (id: Parameters<typeof QuestionName>[0]["id"]) =>
  renderWithProviders(
    <div data-testid="wrapper">
      <QuestionName id={id} />
    </div>,
  );

describe("QuestionName", () => {
  it("renders the question name returned from the API", async () => {
    setupCardEndpoints(TEST_CARD);

    renderName(TEST_CARD.id);

    expect(await screen.findByText("Sales overview")).toBeInTheDocument();
  });

  it("renders nothing while the question is loading", () => {
    setupCardEndpoints(TEST_CARD);

    renderName(TEST_CARD.id);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the question cannot be found", async () => {
    fetchMock.get(`path:/api/card/${TEST_CARD.id}`, 404);

    renderName(TEST_CARD.id);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(`path:/api/card/${TEST_CARD.id}`),
      ).toHaveLength(1);
    });
    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is null", () => {
    renderName(null);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is undefined", () => {
    renderName(undefined);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });

  it("renders nothing when the id is NaN", () => {
    renderName(NaN);

    expect(screen.getByTestId("wrapper")).toBeEmptyDOMElement();
  });
});
