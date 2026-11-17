import userEvent from "@testing-library/user-event";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupBookmarksEndpoints,
  setupCommentEndpoints,
  setupDocumentEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { Route } from "metabase/router";
import type { Comment, DocumentContent } from "metabase-types/api";
import {
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { DocumentPage } from "./DocumentPage";

// CSS modules resolve to an empty object in Jest. Give the menus their real
// class names so the tests can tell a shown menu from a hidden one.
jest.mock("./Editor/AnchorLinkMenu/AnchorLinkMenu.module.css", () => ({
  anchorLinkMenu: "anchorLinkMenu",
  visible: "visible",
}));
jest.mock("./Editor/CommentsMenu/CommentsMenu.module.css", () => ({
  commentsMenu: "commentsMenu",
  visible: "visible",
}));

const SITE_URL = "https://metabase.example.com";
const DOCUMENT_ID = 1;

const CONTENT: DocumentContent["content"] = [
  {
    type: "heading",
    attrs: { level: 1, _id: "heading-block-1" },
    content: [{ type: "text", text: "First Heading" }],
  },
  {
    type: "paragraph",
    attrs: { _id: "paragraph-block-1" },
    content: [{ type: "text", text: "Some content here" }],
  },
  {
    type: "heading",
    attrs: { level: 2, _id: "heading-block-2" },
    content: [{ type: "text", text: "Second Heading" }],
  },
];

interface SetupOpts {
  comments?: Comment[];
}

describe("document block menus", () => {
  const { setAllIntersecting } = setupMockIntersectionObserver();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function setup({ comments = [] }: SetupOpts = {}) {
    mockSettings({ "site-url": SITE_URL });
    setupBookmarksEndpoints([]);
    setupDocumentEndpoints(
      createMockDocument({
        id: DOCUMENT_ID,
        document: createMockDocumentContent({ content: CONTENT }),
      }),
    );
    setupCommentEndpoints(comments, {
      target_type: "document",
      target_id: DOCUMENT_ID,
    });
    setupTimelinesEndpoints([]);

    renderWithProviders(
      <Route path="/document/:entityId" element={<DocumentPage />} />,
      { withRouter: true, initialRoute: `/document/${DOCUMENT_ID}` },
    );

    const content = await screen.findByTestId("document-content");
    await within(content).findByRole("heading", { name: "First Heading" });
    setAllIntersecting(true);

    // One anchor menu per heading, one comments menu per block.
    await waitFor(() =>
      expect(screen.getAllByTestId("anchor-link-menu")).toHaveLength(2),
    );
    expect(screen.getAllByTestId("comments-menu")).toHaveLength(3);

    return { content };
  }

  function getVisibleMenus(testId: string) {
    return screen
      .getAllByTestId(testId)
      .filter((menu) => menu.classList.contains("visible"));
  }

  it("shows the copy link and comments menus of a hovered block", async () => {
    const { content } = await setup();

    expect(getVisibleMenus("anchor-link-menu")).toHaveLength(0);
    expect(getVisibleMenus("comments-menu")).toHaveLength(0);

    await userEvent.hover(
      within(content).getByRole("heading", { name: "First Heading" }),
    );

    const [anchorMenu] = getVisibleMenus("anchor-link-menu");
    expect(getVisibleMenus("anchor-link-menu")).toHaveLength(1);
    expect(
      within(anchorMenu).getByRole("button", { name: /copy link/i }),
    ).toBeInTheDocument();

    const [commentsMenu] = getVisibleMenus("comments-menu");
    expect(getVisibleMenus("comments-menu")).toHaveLength(1);
    expect(
      within(commentsMenu).getByRole("link", { name: /comments/i }),
    ).toHaveAttribute(
      "href",
      `/document/${DOCUMENT_ID}/comments/heading-block-1`,
    );
  });

  it("copies the anchor URL of the hovered heading", async () => {
    const { content } = await setup();
    const writeText = jest.spyOn(navigator.clipboard, "writeText");

    // Hover the second heading, so a menu that ignores hover copies the wrong URL
    await userEvent.hover(
      within(content).getByRole("heading", { name: "Second Heading" }),
    );
    const visibleAnchorMenus = getVisibleMenus("anchor-link-menu");
    expect(visibleAnchorMenus).toHaveLength(1);

    await userEvent.click(
      within(visibleAnchorMenus[0]).getByRole("button", { name: /copy link/i }),
    );

    expect(writeText).toHaveBeenCalledWith(
      `${SITE_URL}/document/${DOCUMENT_ID}#heading-block-2`,
    );
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("shows the unresolved comments count of a block on its comments menu without hover", async () => {
    const deleted = { deleted_at: "2024-01-02T00:00:00Z" };
    const resolved = { is_resolved: true };
    const comment = (opts: Partial<Comment>) =>
      createMockComment({
        target_type: "document",
        target_id: DOCUMENT_ID,
        child_target_id: "paragraph-block-1",
        ...opts,
      });

    await setup({
      comments: [
        // thread with the 1st comment deleted: 2
        comment({ id: 1, ...deleted }),
        comment({ id: 2, parent_comment_id: 1 }),
        comment({ id: 3, parent_comment_id: 1 }),
        // thread with the 2nd comment deleted: 2
        comment({ id: 4 }),
        comment({ id: 5, parent_comment_id: 4, ...deleted }),
        comment({ id: 6, parent_comment_id: 4 }),
        // resolved thread: 0
        comment({ id: 7, ...resolved }),
        comment({ id: 8, parent_comment_id: 7 }),
        // thread with all comments deleted: 0
        comment({ id: 9, ...deleted }),
        comment({ id: 10, parent_comment_id: 9, ...deleted }),
      ],
    });

    await waitFor(() =>
      expect(getVisibleMenus("comments-menu")).toHaveLength(1),
    );
    const [commentsMenu] = getVisibleMenus("comments-menu");
    const link = within(commentsMenu).getByRole("link", { name: /comments/i });
    expect(link).toHaveAttribute(
      "href",
      `/document/${DOCUMENT_ID}/comments/paragraph-block-1`,
    );
    expect(link).toHaveTextContent("4");
  });
});
