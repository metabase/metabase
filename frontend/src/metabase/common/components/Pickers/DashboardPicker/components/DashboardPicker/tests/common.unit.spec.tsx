import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import { defaultOptions } from "../DashboardPicker";

import { setupModal, setupPicker } from "./setup";

describe("DashboardPicker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should select the root collection by default", async () => {
    await setupPicker();

    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 4/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: /Collection 2/ }),
    ).toBeInTheDocument();
  });

  it("should render the path to the collection provided", async () => {
    await setupPicker({ initialValue: { id: 3, model: "collection" } });
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should render the path to the dashboard provided", async () => {
    await setupPicker({ initialValue: { id: 100, model: "dashboard" } });

    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 4/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /Collection 3/ }),
    ).toHaveAttribute("data-active", "true");

    // dashboard itself should start selected
    expect(
      await screen.findByRole("link", { name: /My Dashboard 1/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /My Dashboard 2/ }),
    ).not.toHaveAttribute("data-active", "true");
  });
});

describe("DashboardPickerModal", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render the modal", async () => {
    await setupModal();

    expect(await screen.findByText(/choose a dashboard/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Select/ })).toBeInTheDocument();
  });

  it("should render the modal with no select button", async () => {
    await setupModal({
      options: { ...defaultOptions, hasConfirmButtons: false },
    });

    expect(await screen.findByText(/choose a dashboard/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Our Analytics/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Select/ }),
    ).not.toBeInTheDocument();
  });

  it("should render no tabs by default", async () => {
    await setupModal();

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("should automatically switch to the search tab when a search query is provided", async () => {
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Dashboards/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("should switch back to not having tabs when the search query is cleared", async () => {
    await setupModal();

    const searchInput = await screen.findByPlaceholderText(/search/i);

    await userEvent.type(searchInput, "sizzlipede");

    expect(
      await screen.findByRole("tab", { name: /Dashboards/ }),
    ).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("tab", { name: /Search/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.clear(searchInput);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
