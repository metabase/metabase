import _userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupMetabotPromptSuggestionsEndpoint,
  setupMetabotPromptSuggestionsEndpointError,
  setupRefreshMetabotPromptSuggestionsEndpoint,
  setupRemoveMetabotPromptSuggestionEndpoint,
} from "__support__/server-mocks/metabot";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { fakeSuggestedPromptsCopy } from "metabase-enterprise/api";
import { FIXED_METABOT_IDS } from "metabase-enterprise/metabot/constants";
import type { SuggestedMetabotPrompt } from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";

const DEFAULT_TEST_PAGE_SIZE = 3;

const defaultMockedPrompts =
  fakeSuggestedPromptsCopy[FIXED_METABOT_IDS.DEFAULT];

const userEvent = _userEvent.setup();

const expectVisiblePrompts = async (prompts: SuggestedMetabotPrompt[]) => {
  for (const { prompt } of prompts) {
    expect(await screen.findByText(prompt)).toBeInTheDocument();
  }
};

const prevPage = async () =>
  userEvent.click(await screen.findByLabelText("chevronleft icon"));

const nextPage = async () =>
  userEvent.click(await screen.findByLabelText("chevronright icon"));

type SetupOpts = {
  metabotId?: number;
  pageSize?: number;
  mockInitialPage?: boolean;
};

const setup = async (opts?: SetupOpts) => {
  const {
    metabotId = FIXED_METABOT_IDS.DEFAULT,
    pageSize = DEFAULT_TEST_PAGE_SIZE,
    mockInitialPage = true,
  } = opts ?? {};

  const paginationCtx = {
    offset: 0,
    limit: pageSize,
    total: defaultMockedPrompts.length,
  };

  const nextPaginationContext = mockInitialPage
    ? setupMetabotPromptSuggestionsEndpoint(
        metabotId,
        defaultMockedPrompts,
        paginationCtx,
      )
    : paginationCtx;

  const TestComponent = () => (
    <MetabotPromptSuggestionPane metabotId={metabotId} pageSize={pageSize} />
  );

  renderWithProviders(<Route path="/" component={TestComponent} />, {
    withRouter: true,
  });

  return { metabotId, nextPaginationContext };
};

describe("suggested prompts", () => {
  it("should render the section", async () => {
    await setup();
    expect(await screen.findByText(/Prompt suggestions/)).toBeInTheDocument();
  });

  it("should successfully render a list of prompts", async () => {
    await setup();
    await expectVisiblePrompts(defaultMockedPrompts.slice(0, 3));
  });

  it("should show loading state", async () => {
    await setup();
    const [loadingRow] = await screen.findAllByTestId("prompt-loading-row");
    expect(loadingRow).toBeInTheDocument();
  });

  it("should show empty state", async () => {
    setupMetabotPromptSuggestionsEndpoint(FIXED_METABOT_IDS.DEFAULT, [], {
      offset: 0,
      limit: 3,
      total: 0,
    });
    await setup({ mockInitialPage: false });
    expect(await screen.findByText("No prompts found.")).toBeInTheDocument();
  });

  it("should show error state", async () => {
    setupMetabotPromptSuggestionsEndpointError(FIXED_METABOT_IDS.DEFAULT);
    await setup({ mockInitialPage: false });
    expect(
      await screen.findByText("Something went wrong."),
    ).toBeInTheDocument();
  });

  it("should allow the user to paginate through results", async () => {
    const { metabotId, nextPaginationContext } = await setup();

    expect(await screen.findByTestId("prompts-pagination")).toBeInTheDocument();
    await expectVisiblePrompts(defaultMockedPrompts.slice(0, 3));
    expect(await screen.findByText(/1 - 3/)).toBeInTheDocument();

    const nextNextPaginationContext = setupMetabotPromptSuggestionsEndpoint(
      metabotId,
      defaultMockedPrompts,
      nextPaginationContext,
    );
    await nextPage();
    await expectVisiblePrompts(defaultMockedPrompts.slice(3, 6));
    expect(await screen.findByText(/4 - 6/)).toBeInTheDocument();

    setupMetabotPromptSuggestionsEndpoint(
      metabotId,
      defaultMockedPrompts,
      nextNextPaginationContext,
    );
    await nextPage();
    await expectVisiblePrompts(defaultMockedPrompts.slice(6, 9));
    expect(await screen.findByText(/7 - 8/)).toBeInTheDocument();

    // NOTE: we're relying on rtkquery cache to avoid another fetch
    // that's why we don't need to mock another request
    await prevPage();
    await expectVisiblePrompts(defaultMockedPrompts.slice(3, 6));
    expect(await screen.findByText(/4 - 6/)).toBeInTheDocument();
  });

  it("should link to running a prompt for default metabot", async () => {
    await setup();

    const [runPromptAction] = await screen.findAllByTestId("prompt-run");
    expect(runPromptAction).toBeInTheDocument();
    const firstPrompt = defaultMockedPrompts[0].prompt;
    expect(runPromptAction).toHaveAttribute(
      "href",
      `/metabot/new?q=${encodeURIComponent(firstPrompt)}`,
    );
    expect(runPromptAction).toHaveAttribute("target", "_blank");
  });

  it("should show copy button for prompt on non-default metabots", async () => {
    await setup({ metabotId: FIXED_METABOT_IDS.EMBEDDED });

    const [copyPromptAction] = await screen.findAllByTestId("prompt-copy");
    expect(copyPromptAction).toBeInTheDocument();
    await userEvent.click(copyPromptAction);

    const firstPrompt = defaultMockedPrompts[0].prompt;
    expect(await window.navigator.clipboard.readText()).toBe(firstPrompt);
  });

  it("should allow the user to remove a prompt", async () => {
    const { metabotId } = await setup({ pageSize: 1 });

    const [firstPrompt, secondPrompt] = defaultMockedPrompts;

    setupRemoveMetabotPromptSuggestionEndpoint(metabotId, firstPrompt.id);
    setupMetabotPromptSuggestionsEndpoint(
      metabotId,
      defaultMockedPrompts.slice(1),
      {
        offset: 0,
        limit: 1,
        total: defaultMockedPrompts.length,
      },
    );

    expect(await screen.findByText(firstPrompt.prompt)).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("prompt-remove"));

    expect(await screen.findByText(secondPrompt.prompt)).toBeInTheDocument();
    expect(screen.queryByText(firstPrompt.prompt)).not.toBeInTheDocument();

    // TODO: remove once mocking real endpoints
    setupRefreshMetabotPromptSuggestionsEndpoint(metabotId);
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Refresh prompts suggestions/,
      }),
    );
  });

  it("should allow the user to refresh the prompts", async () => {
    const { metabotId } = await setup({ pageSize: 1 });
    const [firstPrompt] = defaultMockedPrompts;

    setupRefreshMetabotPromptSuggestionsEndpoint(metabotId);
    setupRemoveMetabotPromptSuggestionEndpoint(metabotId, firstPrompt.id);
    setupMetabotPromptSuggestionsEndpoint(
      metabotId,
      defaultMockedPrompts.slice(1),
      {
        offset: 0,
        limit: 1,
        total: defaultMockedPrompts.length,
      },
    );

    // remove a prompt so when we refresh we can see it came back
    expect(await screen.findByText(firstPrompt.prompt)).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("prompt-remove"));
    await waitFor(() => {
      expect(screen.queryByText(firstPrompt.prompt)).not.toBeInTheDocument();
    });

    setupMetabotPromptSuggestionsEndpoint(metabotId, defaultMockedPrompts, {
      offset: 0,
      limit: 1,
      total: defaultMockedPrompts.length,
    });

    const refreshButton = await screen.findByRole("button", {
      name: /Refresh prompts suggestions/,
    });
    expect(refreshButton).toBeInTheDocument();
    await userEvent.click(refreshButton);

    // should load while refreshing
    const [loadingRow] = await screen.findAllByTestId("prompt-loading-row");
    expect(loadingRow).toBeInTheDocument();

    expect(await screen.findByText(firstPrompt.prompt)).toBeInTheDocument();
  });
});
