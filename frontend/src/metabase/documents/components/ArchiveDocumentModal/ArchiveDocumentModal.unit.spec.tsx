import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDocumentCardsEndpoint,
  setupDocumentEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Card } from "metabase-types/api";
import { createMockCard, createMockDocument } from "metabase-types/api/mocks";

import { ArchiveDocumentModal } from "./ArchiveDocumentModal";

const DOCUMENT = createMockDocument({ id: 10, name: "Quarterly review" });

const DOCUMENT_QUESTION = createMockCard({ id: 1, document_id: DOCUMENT.id });

const OUTSIDE_QUESTION = createMockCard({ id: 2, document_id: null });

type SetupOpts = {
  cards?: Card[];
  hasCardsError?: boolean;
};

function setup({ cards = [], hasCardsError = false }: SetupOpts = {}) {
  setupDocumentEndpoints(DOCUMENT);
  if (hasCardsError) {
    fetchMock.get(`path:/api/document/${DOCUMENT.id}/cards`, 500);
  } else {
    setupDocumentCardsEndpoint(DOCUMENT, { cards });
  }
  const onClose = jest.fn();

  renderWithProviders(
    <ArchiveDocumentModal document={DOCUMENT} onClose={onClose} />,
    { withUndos: true },
  );

  return { onClose };
}

function getArchivedFlagOfLastUpdate(): unknown {
  const body: unknown = JSON.parse(
    String(
      fetchMock.callHistory.lastCall(`path:/api/document/${DOCUMENT.id}`, {
        method: "PUT",
      })?.options.body,
    ),
  );
  return body;
}

describe("ArchiveDocumentModal", () => {
  it("says the document's own questions go to the trash with it", async () => {
    setup({ cards: [DOCUMENT_QUESTION, OUTSIDE_QUESTION] });

    expect(
      await screen.findByText(
        "This will trash the document and the questions that are saved in it. Are you sure you want to do this?",
      ),
    ).toBeInTheDocument();
  });

  it("asks plainly when no question is saved in the document", async () => {
    setup({ cards: [OUTSIDE_QUESTION] });

    expect(
      await screen.findByText("Are you sure you want to do this?"),
    ).toBeInTheDocument();
  });

  it("still offers the trash when the questions cannot be looked up", async () => {
    setup({ hasCardsError: true });

    expect(
      await screen.findByText("Are you sure you want to do this?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to trash" })).toBeEnabled();
  });

  it("trashes the document, closes, and offers to undo", async () => {
    const { onClose } = setup({ cards: [DOCUMENT_QUESTION] });

    const trashButton = screen.getByRole("button", { name: "Move to trash" });
    expect(trashButton).toBeDisabled();
    await screen.findByText(/This will trash the document/);
    expect(trashButton).toBeEnabled();
    await userEvent.click(trashButton);

    await waitFor(() =>
      expect(getArchivedFlagOfLastUpdate()).toEqual({
        id: DOCUMENT.id,
        archived: true,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(getArchivedFlagOfLastUpdate()).toEqual({
        id: DOCUMENT.id,
        archived: false,
      }),
    );
  });
});
