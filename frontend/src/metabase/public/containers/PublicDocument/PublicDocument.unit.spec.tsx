import fetchMock from "fetch-mock";

import { act, renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Document } from "metabase-types/api";
import { createMockDocument } from "metabase-types/api/mocks";

import { PublicDocument } from "./PublicDocument";

const FIRST_UUID = "3f2a9c1e-first-public-document";
const FIRST_TEXT = "Hello from the first public document";
const SECOND_UUID = "8b71d4aa-second-public-document";
const SECOND_TEXT = "Hello from the second public document";

function createDocument(id: number, text: string): Document {
  return createMockDocument({
    id,
    name: `Public document ${id}`,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { _id: String(id) },
          content: [{ type: "text", text }],
        },
      ],
    },
    cards: {},
  });
}

function setup() {
  fetchMock.get(
    `path:/api/public/document/${FIRST_UUID}`,
    createDocument(1, FIRST_TEXT),
  );
  fetchMock.get(
    `path:/api/public/document/${SECOND_UUID}`,
    createDocument(2, SECOND_TEXT),
  );

  return renderWithProviders(
    <Route path="/public/document/:uuid" element={<PublicDocument />} />,
    {
      mode: "public",
      initialRoute: `/public/document/${FIRST_UUID}`,
      withRouter: true,
    },
  );
}

describe("PublicDocument", () => {
  it("renders the document content once it has loaded", async () => {
    setup();

    expect(await screen.findByText(FIRST_TEXT)).toBeInTheDocument();
    expect(screen.getByTestId("document-content")).toBeInTheDocument();
  });

  it("replaces the content when navigating to another public document", async () => {
    const { router } = setup();

    expect(await screen.findByText(FIRST_TEXT)).toBeInTheDocument();

    act(() => {
      router?.navigate(`/public/document/${SECOND_UUID}`);
    });

    expect(await screen.findByText(SECOND_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FIRST_TEXT)).not.toBeInTheDocument();
  });
});
