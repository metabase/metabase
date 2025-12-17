import userEvent from "@testing-library/user-event";

import { act, screen, waitFor, within } from "__support__/ui";

import { setup } from "./setup";

describe("CollectionPicker", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should select the root collection by default", async () => {
    act(() => {
      setup();
    });

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

  it("should render the path to the value provided", async () => {
    act(() => {
      setup({ initialValue: { id: 3, model: "collection" } });
    });
    await screen.findByRole("link", { name: /Our Analytics/ });
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

  it("should render the path back to personal collection", async () => {
    act(() => {
      setup({ initialValue: { id: 5, model: "collection" } });
    });
    expect(
      await screen.findByRole("link", { name: /My personal collection/ }),
    ).toHaveAttribute("data-active", "true");

    expect(
      await screen.findByRole("link", { name: /personal sub_collection/ }),
    ).toHaveAttribute("data-active", "true");
  });

  it("should allow selecting, but not navigating into collections without children", async () => {
    act(() => {
      setup({ initialValue: { id: 1, model: "collection" } });
    });

    const personalSubCollectionButton = await screen.findByRole("link", {
      name: /personal sub_collection/,
    });
    expect(personalSubCollectionButton).not.toHaveAttribute("data-active");

    expect(
      within(personalSubCollectionButton).queryByLabelText("chevronright icon"),
    ).not.toBeInTheDocument();

    await userEvent.click(personalSubCollectionButton);

    expect(personalSubCollectionButton).toHaveAttribute("data-active", "true");

    // selecting an empty collection should not show another column
    await waitFor(() =>
      expect(
        screen.queryByTestId("item-picker-level-2"),
      ).not.toBeInTheDocument(),
    );
  });

  it("should allow disabling certain items in the collection picker", async () => {
    act(() => {
      setup({
        initialValue: { id: 1, model: "collection" },
        shouldDisableItem: () => true,
      });
    });

    const links = await screen.findAllByRole("link");
    for (const link of links) {
      expect(link).toHaveAttribute("data-disabled", "true");
    }
  });
});
