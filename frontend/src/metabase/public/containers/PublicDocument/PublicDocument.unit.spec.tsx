import userEvent from "@testing-library/user-event";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupForbiddenCardEndpoints,
  setupLastDownloadFormatEndpoints,
  setupPublicDocumentCardQueryEndpoint,
  setupPublicDocumentEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DocumentContent } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { PublicDocument } from "./PublicDocument";

registerVisualizations();

const PUBLIC_UUID = "f7e6d5c4-b3a2-4190-8877-665544332211";
const PARAGRAPH_TEXT = "This is a test paragraph";
const METABOT_PROMPT = "Some metabot prompt";
const CARD = createMockCard({ id: 42, name: "Orders" });

const TEXT_WITH_METABOT_CONTENT = createMockDocumentContent({
  content: [
    {
      type: "paragraph",
      attrs: { _id: "1" },
      content: [{ type: "text", text: PARAGRAPH_TEXT }],
    },
    {
      type: "metabot",
      content: [{ type: "text", text: METABOT_PROMPT }],
    },
  ],
});

const CARD_CONTENT = createMockDocumentContent({
  content: [
    {
      type: "paragraph",
      attrs: { _id: "1" },
      content: [{ type: "text", text: PARAGRAPH_TEXT }],
    },
    {
      type: "resizeNode",
      attrs: { height: 400, minHeight: 280 },
      content: [
        {
          type: "cardEmbed",
          attrs: { id: CARD.id, name: null, _id: "2" },
        },
      ],
    },
  ],
});

interface SetupOpts {
  content: DocumentContent;
  hideEmbedBranding?: boolean;
}

const setup = ({ content, hideEmbedBranding = false }: SetupOpts) => {
  setupPublicDocumentEndpoints(
    PUBLIC_UUID,
    createMockDocument({
      name: "Public Document",
      document: content,
      cards: { [CARD.id]: CARD },
    }),
  );
  setupPublicDocumentCardQueryEndpoint(
    PUBLIC_UUID,
    CARD.id,
    createMockDataset(),
  );
  // Card embeds also call the authenticated card endpoints, which fail for public viewers
  setupForbiddenCardEndpoints(CARD.id);
  setupLastDownloadFormatEndpoints();

  renderWithProviders(
    <Route path="/public/document/:uuid" element={<PublicDocument />} />,
    {
      mode: "public",
      withRouter: true,
      initialRoute: `/public/document/${PUBLIC_UUID}`,
      storeInitialState: createMockState({
        settings: mockSettings({
          "hide-embed-branding?": hideEmbedBranding,
          "metabot-enabled?": false,
        }),
      }),
    },
  );
};

const getDocumentContent = () => screen.findByTestId("document-content");

describe("PublicDocument", () => {
  const { setIntersecting } = setupMockIntersectionObserver();

  it("renders the document read-only, without comments, the header menu or metabot controls", async () => {
    setup({ content: TEXT_WITH_METABOT_CONTENT });

    const documentContent = await getDocumentContent();
    expect(
      await within(documentContent).findByText(PARAGRAPH_TEXT),
    ).toBeInTheDocument();

    expect(within(documentContent).getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "More options" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Comments" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Show all comments" }),
    ).not.toBeInTheDocument();

    const metabotPrompt = within(documentContent).getByText(METABOT_PROMPT);
    expect(
      within(documentContent).queryByRole("button"),
    ).not.toBeInTheDocument();

    await userEvent.type(metabotPrompt, "a");
    expect(
      within(documentContent).getByText(METABOT_PROMPT),
    ).toBeInTheDocument();
  });

  it("only offers 'Download results' in the card menu", async () => {
    setup({ content: CARD_CONTENT });

    expect(
      await within(await getDocumentContent()).findByTestId("card-embed-title"),
    ).toHaveTextContent("Orders");
    setIntersecting(true);

    await userEvent.click(
      await within(await getDocumentContent()).findByRole("button", {
        name: "ellipsis",
      }),
    );

    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Download results" }),
    );

    expect(await screen.findByText(".csv")).toBeInTheDocument();
    expect(screen.getByText(".xlsx")).toBeInTheDocument();
    expect(screen.getByText(".json")).toBeInTheDocument();
    expect(screen.getByTestId("download-results-button")).toBeInTheDocument();
  });

  it("shows the 'Powered by Metabase' link when embed branding is not hidden", async () => {
    setup({ content: CARD_CONTENT });

    expect(
      await within(await getDocumentContent()).findByText(PARAGRAPH_TEXT),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Powered by Metabase" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("https://www.metabase.com?"),
    );
  });

  it("hides the 'Powered by Metabase' link when embed branding is hidden", async () => {
    setup({ content: CARD_CONTENT, hideEmbedBranding: true });

    expect(
      await within(await getDocumentContent()).findByText(PARAGRAPH_TEXT),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Powered by Metabase" }),
    ).not.toBeInTheDocument();
  });
});
