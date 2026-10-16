import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockDocument,
} from "metabase-types/api/mocks";

import { DOCUMENTS_COLLECTION } from "../../../test-utils";
import { trackDataStudioDocumentCreated } from "../../analytics";

import { CreateLibraryDocumentModal } from "./CreateLibraryDocumentModal";

jest.mock("../../analytics");

function setup() {
  const onClose = jest.fn();
  fetchMock.get(
    `path:/api/collection/${DOCUMENTS_COLLECTION.id}`,
    createMockCollection({ ...DOCUMENTS_COLLECTION, is_library_root: true }),
  );
  fetchMock.get("path:/api/collection/root", createMockCollection());
  fetchMock.post(
    "path:/api/document",
    createMockDocument({
      id: 42,
      name: "Quarterly review",
      collection_id: DOCUMENTS_COLLECTION.id,
    }),
  );

  const { router } = renderWithProviders(
    <CreateLibraryDocumentModal
      opened
      collectionId={DOCUMENTS_COLLECTION.id}
      onClose={onClose}
    />,
    { withRouter: true, initialRoute: "/data-studio/documents" },
  );

  return { onClose, router };
}

describe("CreateLibraryDocumentModal", () => {
  it("preselects the Documents collection", async () => {
    setup();

    expect(await screen.findByText("Documents")).toBeInTheDocument();
  });

  it("creates an empty document in the Library and opens its editor", async () => {
    const { router } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Quarterly review");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(router?.location.pathname).toBe("/document/42"));
    expect(
      await fetchMock.callHistory
        .lastCall("path:/api/document")
        ?.request?.json(),
    ).toEqual({
      name: "Quarterly review",
      collection_id: DOCUMENTS_COLLECTION.id,
      document: { type: "doc", content: [] },
    });
    expect(jest.mocked(trackDataStudioDocumentCreated)).toHaveBeenCalledTimes(
      1,
    );
    expect(jest.mocked(trackDataStudioDocumentCreated)).toHaveBeenCalledWith(
      42,
    );
  });

  it("asks for a name before creating", async () => {
    setup();

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
