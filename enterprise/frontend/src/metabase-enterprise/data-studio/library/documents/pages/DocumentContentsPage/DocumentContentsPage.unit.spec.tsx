import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDocumentCardsEndpoint,
  setupDocumentEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { Route } from "metabase/router";
import type { Card, UnreadableCard } from "metabase-types/api";
import { createMockCard, createMockDocument } from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  ORDERS_QUESTION,
  REVENUE_METRIC,
  SHARED_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DocumentContentsPage } from "./DocumentContentsPage";

const DOCUMENT_ID = 10;
const UNREADABLE_CARD: UnreadableCard = { id: 99 };

const DOCUMENT = createMockDocument({
  id: DOCUMENT_ID,
  name: "Quarterly review",
  collection_id: DOCUMENTS_COLLECTION.id,
  collection: DOCUMENTS_COLLECTION,
});

const DOCUMENT_QUESTION = createMockCard({
  id: 3,
  name: "Weekly signups",
  type: "question",
  document_id: DOCUMENT_ID,
  collection_id: DOCUMENTS_COLLECTION.id,
});

const MOVED_DOCUMENT_QUESTION = createMockCard({
  id: 5,
  name: "Moved signups",
  type: "question",
  document_id: DOCUMENT_ID,
  collection_id: SHARED_COLLECTION.id,
});

type SetupOpts = {
  cards?: (Card | UnreadableCard)[];
  hasCardsError?: boolean;
};

function setup({ cards = [], hasCardsError = false }: SetupOpts = {}) {
  mockGetBoundingClientRect({ width: 1000, height: 800 });
  setupDocumentEndpoints(DOCUMENT);
  if (hasCardsError) {
    fetchMock.get(`path:/api/document/${DOCUMENT_ID}/cards`, {
      status: 500,
      body: { message: "Cards failed to load" },
    });
  } else {
    setupDocumentCardsEndpoint(DOCUMENT, { cards });
  }
  setupLibraryCollectionEndpoints([SHARED_COLLECTION]);

  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId/contents"
      element={<DocumentContentsPage />}
    />,
    {
      withRouter: true,
      initialRoute: `/data-studio/documents/${DOCUMENT_ID}/contents`,
    },
  );
}

describe("DocumentContentsPage", () => {
  it("shows a row per embedded card, placing document questions in the document", async () => {
    setup({ cards: [ORDERS_QUESTION, DOCUMENT_QUESTION] });

    await waitForLoaderToBeRemoved();
    expect(
      await screen.findByTestId("document-contents-page"),
    ).toBeInTheDocument();

    const ordersRow = await screen.findByRole("row", { name: /Orders/ });
    expect(await within(ordersRow).findByText("Shared")).toBeInTheDocument();
    const signupsRow = screen.getByRole("row", { name: /Weekly signups/ });
    expect(
      within(signupsRow).getByText("Quarterly review"),
    ).toBeInTheDocument();
  });

  it("loads every embedded card in one request", async () => {
    setup({ cards: [ORDERS_QUESTION, REVENUE_METRIC, DOCUMENT_QUESTION] });

    expect(
      await screen.findByRole("row", { name: /Weekly signups/ }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls(`path:/api/document/${DOCUMENT_ID}/cards`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory
        .calls()
        .filter((call) => new URL(call.url).pathname.startsWith("/api/card/")),
    ).toHaveLength(0);
  });

  it("shows where a document question lives after it was moved out of the document", async () => {
    setup({ cards: [MOVED_DOCUMENT_QUESTION] });

    const movedRow = await screen.findByRole("row", { name: /Moved signups/ });
    expect(await within(movedRow).findByText("Shared")).toBeInTheDocument();
    expect(
      within(movedRow).queryByText("Quarterly review"),
    ).not.toBeInTheDocument();
  });

  it("keeps the document's order, with a card the user cannot read in its place", async () => {
    setup({ cards: [ORDERS_QUESTION, UNREADABLE_CARD, REVENUE_METRIC] });

    await screen.findByRole("row", { name: /Revenue/ });
    expect(
      screen.getAllByTestId("content-name").map((cell) => cell.textContent),
    ).toEqual(["Orders", "Restricted question", "Revenue"]);
  });

  it("shows a row without a link for a card the user cannot read", async () => {
    setup({ cards: [ORDERS_QUESTION, UNREADABLE_CARD] });

    const unreadableRow = await screen.findByRole("row", {
      name: /Restricted question/,
    });
    expect(within(unreadableRow).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Orders/ })).toBeInTheDocument();
    expect(screen.getAllByTestId("content-name")).toHaveLength(2);
  });

  it("explains a restricted row on hover", async () => {
    setup({ cards: [UNREADABLE_CARD] });

    await userEvent.hover(await screen.findByText("Restricted question"));
    expect(
      await screen.findByRole("tooltip", {
        name: "Sorry, you don't have permission to see this card.",
      }),
    ).toBeInTheDocument();
  });

  it("shows an error when the cards fail to load", async () => {
    setup({ hasCardsError: true });

    expect(await screen.findByText("Cards failed to load")).toBeInTheDocument();
    expect(screen.getByTestId("document-contents-page")).toBeInTheDocument();
    expect(
      screen.queryByText("This document has no questions yet"),
    ).not.toBeInTheDocument();
  });

  it("tells the user when the document has no questions", async () => {
    setup();

    expect(
      await screen.findByText("This document has no questions yet"),
    ).toBeInTheDocument();
  });
});
