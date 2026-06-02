import _userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SearchPromptEntity } from "metabase-types/api";

import { SearchPromptsPage } from "./SearchPromptsPage";

const userEvent = _userEvent.setup();

const PROMPTS: SearchPromptEntity[] = [
  {
    id: 1,
    prompt: "active users",
    type: "sources",
    entities: [{ model: "metric", id: 10, name: "Active users" }],
    verified: true,
  },
  {
    id: 2,
    prompt: "revenue by month",
    type: "canonical",
    entities: [],
    verified: false,
  },
];

type SetupOpts = {
  prompts?: SearchPromptEntity[];
  error?: boolean;
};

const setup = ({ prompts = PROMPTS, error = false }: SetupOpts = {}) => {
  if (error) {
    fetchMock.get("path:/api/metabot/search-prompt/", 500);
  } else {
    fetchMock.get("path:/api/metabot/search-prompt/", (url: string) => {
      const type = new URL(url).searchParams.get("type") as
        | "sources"
        | "canonical"
        | null;
      const filtered = type ? prompts.filter((p) => p.type === type) : prompts;
      return { data: filtered, total: filtered.length, limit: 10, offset: 0 };
    });
  }

  fetchMock.post("path:/api/metabot/search-prompt/", (url: string, call) => {
    const body = JSON.parse(String(call.body ?? "{}"));
    return { id: 99, verified: false, entities: [], type: "sources", ...body };
  });
  fetchMock.put("path:/api/metabot/search-prompt/1", (url: string, call) => {
    const body = JSON.parse(String(call.body ?? "{}"));
    return { ...PROMPTS[0], ...body };
  });
  fetchMock.delete("path:/api/metabot/search-prompt/1", 204);

  renderWithProviders(
    <>
      <SearchPromptsPage />
      <UndoListing />
    </>,
  );
};

const lastBody = (matcher: string, method: string) => {
  const calls = fetchMock.callHistory.calls(matcher, { method });
  const lastCall = calls[calls.length - 1];
  return JSON.parse(String(lastCall?.options?.body ?? "{}"));
};

describe("SearchPromptsPage", () => {
  it("renders each section with its prompts, entities, and verified icon", async () => {
    setup();

    // sources section
    expect(await screen.findByText("active users")).toBeInTheDocument();
    expect(screen.getByText("Active users")).toBeInTheDocument();

    // canonical section
    expect(screen.getByText("revenue by month")).toBeInTheDocument();

    // only the verified row shows the verified icon
    expect(screen.getAllByTestId("search-prompt-verified")).toHaveLength(1);
  });

  it("shows the empty state when there are no prompts", async () => {
    setup({ prompts: [] });

    const emptyMessages = await screen.findAllByText("No search prompts yet.");
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the error state when the list request fails", async () => {
    setup({ error: true });

    const errorMessages = await screen.findAllByText("Something went wrong.");
    expect(errorMessages.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a search prompt in the sources section with the entered prompt", async () => {
    setup({ prompts: [] });

    const addButtons = await screen.findAllByRole("button", {
      name: /New search prompt/,
    });
    await userEvent.click(addButtons[0]); // first button is the sources section
    await userEvent.type(await screen.findByRole("textbox"), "new prompt");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/", {
          method: "POST",
        }),
      ).toBe(true);
    });
    expect(lastBody("path:/api/metabot/search-prompt/", "POST")).toEqual({
      prompt: "new prompt",
      entities: [],
      verified: false,
      type: "sources",
    });
  });

  it("edits the prompt, entities, and verified status", async () => {
    setup();

    await userEvent.click(await screen.findByText("active users"));
    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "renamed prompt");
    await userEvent.click(screen.getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/1", {
          method: "PUT",
        }),
      ).toBe(true);
    });
    expect(lastBody("path:/api/metabot/search-prompt/1", "PUT")).toEqual({
      prompt: "renamed prompt",
      entities: PROMPTS[0].entities,
      verified: false,
    });
  });

  it("deletes a search prompt after confirmation", async () => {
    setup();

    await userEvent.click(
      (await screen.findAllByTestId("search-prompt-delete"))[0],
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/metabot/search-prompt/1", {
          method: "DELETE",
        }),
      ).toBe(true);
    });
  });
});
