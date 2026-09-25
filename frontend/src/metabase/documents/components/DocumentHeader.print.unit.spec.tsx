import userEvent from "@testing-library/user-event";

import { setupCommentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { createMockDocument } from "metabase-types/api/mocks";

import { DocumentHeader } from "./DocumentHeader";

const DOCUMENT = createMockDocument({ id: 42 });

const setup = () => {
  setupCommentEndpoints([], { target_type: "document", target_id: DOCUMENT.id });

  renderWithProviders(
    <DocumentHeader
      document={DOCUMENT}
      documentTitle={DOCUMENT.name}
      isNewDocument={false}
      canWrite
      showSaveButton={false}
      isBookmarked={false}
      onTitleChange={jest.fn()}
      onSave={jest.fn()}
      onMove={jest.fn()}
      onDuplicate={jest.fn()}
      onToggleBookmark={jest.fn()}
      onArchive={jest.fn()}
      onShowHistory={jest.fn()}
    />,
  );
};

describe("DocumentHeader > print", () => {
  const originalPrint = window.print;

  beforeEach(() => {
    window.print = jest.fn();
  });

  afterEach(() => {
    window.print = originalPrint;
    jest.restoreAllMocks();
  });

  it("tracks a document_print event when printing", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    setup();

    await userEvent.click(screen.getByLabelText("More options"));
    await userEvent.click(screen.getByText("Print Document"));

    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "document_print",
      target_id: DOCUMENT.id,
    });
  });
});
