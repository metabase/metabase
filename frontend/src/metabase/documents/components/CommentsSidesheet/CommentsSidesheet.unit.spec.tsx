import userEvent from "@testing-library/user-event";

import {
  setupCommentEndpoints,
  setupUpdateCommentEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { initialState as documentsInitialState } from "metabase/documents/documents.slice";
import { Route } from "metabase/router";
import type { Comment } from "metabase-types/api";
import {
  createMockDocument,
  createMockDocumentContent,
} from "metabase-types/api/mocks";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { CommentsSidesheet } from "./CommentsSidesheet";

const DOCUMENT_ID = 1;
const HEADING_ID = "heading-block-1";
const PARAGRAPH_ID = "paragraph-block-1";
const COMMENTS_PATH = `/document/${DOCUMENT_ID}/comments/${HEADING_ID}`;

function createComment(
  text: string,
  childTargetId: string,
  comment?: Partial<Comment>,
) {
  return createMockComment({
    target_type: "document",
    target_id: DOCUMENT_ID,
    child_target_id: childTargetId,
    content: createMockDocumentContent({
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }),
    ...comment,
  });
}

interface SetupOpts {
  isFooResolved?: boolean;
  /** Add another, resolved thread so the tabs stay when Foo is re-opened. */
  withResolvedThread?: boolean;
  /** Render with Foo's comment link as the browser URL, as when it is opened cold. */
  openFooLink?: boolean;
}

function setup({
  isFooResolved = false,
  withResolvedThread = false,
  openFooLink = false,
}: SetupOpts = {}) {
  const foo = createComment("Foo", HEADING_ID, { is_resolved: isFooResolved });
  const comments = [
    foo,
    createComment("Bar", HEADING_ID),
    createComment("Paragraph Foo", PARAGRAPH_ID),
    ...(withResolvedThread
      ? [createComment("Baz", HEADING_ID, { is_resolved: true })]
      : []),
  ];
  setupCommentEndpoints(comments, {
    target_type: "document",
    target_id: DOCUMENT_ID,
  });
  setupUpdateCommentEndpoint(comments);

  const fooLink = `${COMMENTS_PATH}#comment-${foo.id}`;
  // The comments read the hash from the browser location, not the router.
  window.history.replaceState(null, "", openFooLink ? fooLink : COMMENTS_PATH);

  renderWithProviders(
    <Route
      path="/document/:entityId/comments/:childTargetId"
      element={
        <CommentsSidesheet
          params={{ childTargetId: HEADING_ID }}
          onClose={jest.fn()}
        />
      }
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: COMMENTS_PATH,
      storeInitialState: {
        documents: {
          ...documentsInitialState,
          currentDocument: createMockDocument({ id: DOCUMENT_ID }),
        },
      },
    },
  );

  return { fooLink };
}

async function findCommentByText(text: string) {
  return waitFor(() => {
    const comment = screen
      .getAllByTestId("discussion-comment")
      .find((element) => within(element).queryByText(text));
    if (!comment) {
      throw new Error(`No comment with text "${text}"`);
    }
    return comment;
  });
}

/** Sets the browser URL in place, like opening a link that only changes the hash. */
function openLink(link: string) {
  act(() => window.history.replaceState(null, "", link));
}

function getSidebar() {
  return screen.getByTestId("comments-sidebar");
}

describe("CommentsSidesheet comment links", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // jsdom keeps the URL between tests
    openLink("/");
  });

  it("copies a link to a comment", async () => {
    const { fooLink } = setup();
    const writeText = jest.spyOn(navigator.clipboard, "writeText");

    const foo = await findCommentByText("Foo");
    await userEvent.click(within(foo).getByLabelText("More actions"));
    await userEvent.click(
      await within(await screen.findByRole("dialog")).findByText("Copy link"),
    );

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}${fooLink}`,
    );
    expect(await screen.findByText("Copied link")).toBeInTheDocument();
  });

  it("opens a comment link in the comment's thread and highlights the comment", async () => {
    const { fooLink } = setup();
    expect(await findCommentByText("Foo")).not.toHaveAttribute("aria-current");
    openLink(fooLink);

    const sidebar = getSidebar();
    expect(
      await within(sidebar).findByRole("heading", {
        name: "Comments about this",
      }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole("heading", { name: "All comments" }),
    ).not.toBeInTheDocument();
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(within(sidebar).getAllByTestId("discussion-comment")).toHaveLength(
      2,
    );
    expect(await findCommentByText("Bar")).not.toHaveAttribute("aria-current");
  });

  it("switches between the Open and Resolved tabs as the linked thread is resolved and unresolved", async () => {
    const { fooLink } = setup();
    expect(await findCommentByText("Foo")).not.toHaveAttribute("aria-current");
    openLink(fooLink);

    expect(await findCommentByText("Foo")).toBeInTheDocument();
    expect(
      screen.queryByTestId("comments-resolved-tab"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Resolve",
      }),
    );

    expect(await screen.findByTestId("comments-resolved-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Re-open",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByTestId("comments-resolved-tab"),
      ).not.toBeInTheDocument(),
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("selects the Open or Resolved tab from the linked thread's state while other threads stay resolved", async () => {
    setup({ withResolvedThread: true, openFooLink: true });

    expect(await screen.findByTestId("comments-open-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Resolve",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("comments-resolved-tab")).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    await userEvent.click(
      within(await findCommentByText("Foo")).getByRole("button", {
        name: "Re-open",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("comments-open-tab")).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByTestId("comments-resolved-tab")).toBeInTheDocument();
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("opens a link to a resolved comment in the Resolved tab", async () => {
    setup({ isFooResolved: true, openFooLink: true });

    expect(await screen.findByTestId("comments-resolved-tab")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await findCommentByText("Foo")).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(
      within(getSidebar()).getAllByTestId("discussion-comment"),
    ).toHaveLength(1);
  });
});
