import _userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { fakeSuggestedPromptsCopy } from "metabase-enterprise/api";
import { FIXED_METABOT_IDS } from "metabase-enterprise/metabot/constants";
import type { SuggestedMetabotPrompt } from "metabase-types/api";

import { MetabotPromptSuggestionPane } from "./MetabotAdminSuggestedPrompts";

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
};

const setup = async (opts?: SetupOpts) => {
  const { metabotId = FIXED_METABOT_IDS.DEFAULT, pageSize = 3 } = opts ?? {};

  const TestComponent = () => (
    <MetabotPromptSuggestionPane metabotId={metabotId} pageSize={pageSize} />
  );

  renderWithProviders(<Route path="/" component={TestComponent} />, {
    withRouter: true,
  });
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

  it.todo("should show error state");

  it("should allow the user to paginate through results", async () => {
    await setup();

    expect(await screen.findByTestId("prompts-pagination")).toBeInTheDocument();
    await expectVisiblePrompts(defaultMockedPrompts.slice(0, 3));
    expect(await screen.findByText(/1 - 3/)).toBeInTheDocument();

    await nextPage();
    await expectVisiblePrompts(defaultMockedPrompts.slice(3, 6));
    expect(await screen.findByText(/4 - 6/)).toBeInTheDocument();

    await nextPage();
    await expectVisiblePrompts(defaultMockedPrompts.slice(6, 9));
    expect(await screen.findByText(/7 - 8/)).toBeInTheDocument();

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
    await setup({ pageSize: 1 });

    const [firstPrompt, secondPrompt] = defaultMockedPrompts;

    expect(await screen.findByText(firstPrompt.prompt)).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("prompt-remove"));

    expect(await screen.findByText(secondPrompt.prompt)).toBeInTheDocument();
    expect(screen.queryByText(firstPrompt.prompt)).not.toBeInTheDocument();

    // TODO: remove once mocking real endpoints
    await userEvent.click(
      await screen.findByRole("button", {
        name: /Refresh prompts suggestions/,
      }),
    );
  });

  it("should allow the user to refresh the prompts", async () => {
    await setup({ pageSize: 1 });

    const [firstPrompt] = defaultMockedPrompts;

    // remove a prompt so when we refresh we can see it came back
    expect(await screen.findByText(firstPrompt.prompt)).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("prompt-remove"));
    await waitFor(() => {
      expect(screen.queryByText(firstPrompt.prompt)).not.toBeInTheDocument();
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

  it.todo("should render suggestions once a collection is selected");

  it.todo("should refetch suggestions when a collection is changed");

  it.todo("should remove suggestions when a collection is cleared");
});
