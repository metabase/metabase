import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import { setupUsersEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { UserListResult } from "metabase-types/api";
import { createMockUserListResult } from "metabase-types/api/mocks";

import { UserPicker } from "./UserPicker";
import type { UserOption } from "./types";

const JANE = createMockUserListResult({
  id: 1,
  first_name: "Jane",
  last_name: "Doe",
  common_name: "Jane Doe",
});

const BOB = createMockUserListResult({
  id: 2,
  first_name: "Bob",
  last_name: "Boss",
  common_name: "Bob Boss",
});

type SetupOpts = {
  users?: UserListResult[];
};

const Wrapper = () => {
  const [value, setValue] = useState<UserOption | null>(null);
  return <UserPicker value={value} onChange={setValue} />;
};

const setup = ({ users = [JANE, BOB] }: SetupOpts = {}) => {
  setupUsersEndpoints(users);
  return renderWithProviders(<Wrapper />);
};

const getUserQueries = () =>
  fetchMock.callHistory
    .calls("path:/api/user")
    .map((call) => new URL(call.url).searchParams.get("query"));

const flushDebounce = () => {
  act(() => {
    jest.advanceTimersByTime(SEARCH_DEBOUNCE_DURATION);
  });
};

describe("UserPicker", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("fetches users with an empty query on initial render", async () => {
    setup();

    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    expect(getUserQueries().at(-1)).toBe("");
  });

  it("sends the typed text as the backend query when nothing is selected", async () => {
    setup();
    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByPlaceholderText("Select a user"));
    await userEvent.type(screen.getByPlaceholderText("Select a user"), "ja");
    flushDebounce();

    await waitFor(() => {
      expect(getUserQueries()).toContain("ja");
    });
  });

  it("does not search the BE for the selected user's literal name after selection", async () => {
    setup();
    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getByPlaceholderText("Select a user"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Jane Doe" }),
    );
    flushDebounce();

    await waitFor(() => {
      expect(getUserQueries().at(-1)).toBe("");
    });
    expect(getUserQueries()).not.toContain("Jane Doe");
  });

  it("ignores trailing whitespace typed after the selected label", async () => {
    setup();
    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    const input = screen.getByPlaceholderText("Select a user");
    await userEvent.click(input);
    await userEvent.click(
      await screen.findByRole("option", { name: "Jane Doe" }),
    );
    flushDebounce();

    await userEvent.type(input, " ");
    flushDebounce();

    await waitFor(() => {
      expect(getUserQueries().at(-1)).toBe("");
    });
    expect(getUserQueries()).not.toContain("Jane Doe ");
    expect(getUserQueries()).not.toContain("Jane Doe");
  });

  it("trims whitespace before sending the typed text to the BE", async () => {
    setup();
    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    const input = screen.getByPlaceholderText("Select a user");
    await userEvent.click(input);
    await userEvent.type(input, "Bo ");
    flushDebounce();

    await waitFor(() => {
      expect(getUserQueries()).toContain("Bo");
    });
    expect(getUserQueries()).not.toContain("Bo ");
  });

  it("sends the typed text after clearing and typing a new search", async () => {
    setup();
    await waitFor(() => {
      expect(getUserQueries().length).toBeGreaterThan(0);
    });

    const input = screen.getByPlaceholderText("Select a user");
    await userEvent.click(input);
    await userEvent.click(
      await screen.findByRole("option", { name: "Jane Doe" }),
    );
    flushDebounce();

    await userEvent.clear(input);
    await userEvent.type(input, "Bo");
    flushDebounce();

    await waitFor(() => {
      expect(getUserQueries()).toContain("Bo");
    });
  });
});
