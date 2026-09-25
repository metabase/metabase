import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import PublicApp from "metabase/public/containers/PublicApp";
import { Route } from "metabase/router";
import {
  createMockDocument,
  createMockDocumentContent,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import { PublicDocument } from "./PublicDocument";

const UUID = "public-document-uuid";
const TEXT = "This is a public paragraph";

const DOCUMENT = createMockDocument({
  name: "Public Document",
  document: createMockDocumentContent({
    content: [
      {
        type: "paragraph",
        attrs: { _id: "1" },
        content: [{ type: "text", text: TEXT }],
      },
    ],
  }),
});

type SetupOpts = {
  response?: { status: number; body: unknown };
  hasEmbedBranding?: boolean;
};

function setup({
  response = { status: 200, body: DOCUMENT },
  hasEmbedBranding = true,
}: SetupOpts = {}) {
  fetchMock.get(`path:/api/public/document/${UUID}`, response);

  renderWithProviders(
    <Route path="/public" element={<PublicApp />}>
      <Route path="document/:uuid" element={<PublicDocument />} />
    </Route>,
    {
      mode: "public",
      initialRoute: `/public/document/${UUID}`,
      storeInitialState: {
        settings: mockSettings({ "hide-embed-branding?": !hasEmbedBranding }),
      },
      withRouter: true,
    },
  );
}

describe("PublicDocument", () => {
  it("renders the document read-only", async () => {
    setup();

    const content = await screen.findByTestId("document-content");
    expect(content).toHaveTextContent(TEXT);
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });

  it("renders metabot blocks without run or close buttons", async () => {
    const prompt = "Some metabot prompt";
    fetchMock.get(
      "path:/api/metabot/permissions/user-permissions",
      createMockUserMetabotPermissions(),
    );
    setup({
      response: {
        status: 200,
        body: createMockDocument({
          document: createMockDocumentContent({
            content: [
              { type: "metabot", content: [{ type: "text", text: prompt }] },
            ],
          }),
        }),
      },
    });

    const content = await screen.findByTestId("document-content");
    expect(content).toHaveTextContent(prompt);
    expect(within(content).queryAllByRole("button")).toHaveLength(0);
  });

  it("renders the 'Powered by Metabase' footer link", async () => {
    setup();

    expect(await screen.findByTestId("document-content")).toHaveTextContent(
      TEXT,
    );
    expect(
      within(screen.getByTestId("embedding-footer")).getByRole("link", {
        name: "Powered by Metabase",
      }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("https://www.metabase.com?"),
    );
  });

  it("hides the footer when embed branding is hidden", async () => {
    setup({ hasEmbedBranding: false });

    expect(await screen.findByTestId("document-content")).toHaveTextContent(
      TEXT,
    );
    expect(screen.queryByTestId("embedding-footer")).not.toBeInTheDocument();
  });

  it("renders the not found page when the document is missing or archived", async () => {
    setup({ response: { status: 404, body: "Not found." } });

    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByTestId("document-content")).not.toBeInTheDocument();
  });

  it("renders the server's error message when public sharing is disabled", async () => {
    setup({ response: { status: 400, body: "An error occurred." } });

    expect(await screen.findByText("An error occurred.")).toBeInTheDocument();
    expect(screen.queryByTestId("document-content")).not.toBeInTheDocument();
  });
});
