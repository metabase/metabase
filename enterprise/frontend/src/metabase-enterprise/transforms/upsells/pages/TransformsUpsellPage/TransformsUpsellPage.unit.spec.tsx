import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import {
  assertLeftColumnContent,
  setup,
  transformsAdvancedPrice,
  transformsBasicPrice,
  waitForLoadingToFinish,
} from "./TransformsUpsellPage.setup.spec";

describe("TransformsUpsellPage", () => {
  it("renders single column layout without CTA when user is not a store user", async () => {
    setup({ isHosted: true, isStoreUser: false });

    await waitForLoadingToFinish();
    assertLeftColumnContent();

    expect(
      screen.queryByRole("heading", { name: "Add transforms to your plan" }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Confirm purchase" }),
    ).not.toBeInTheDocument();
  });

  it("renders 2-column layout with CTA when user is a store user", async () => {
    setup({ isHosted: true, isStoreUser: true });

    await waitForLoadingToFinish();
    assertLeftColumnContent();

    expect(
      screen.getByRole("heading", { name: "Add transforms to your plan" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Confirm purchase" }),
    ).toBeInTheDocument();
  });

  it("shows both transforms tiers and updates price when switching", async () => {
    setup({ isHosted: true, isStoreUser: true });

    await waitForLoadingToFinish();

    await userEvent.click(screen.getByRole("radio", { name: /SQL only/ }));
    expect(screen.getByTestId("due-today-amount")).toHaveTextContent(
      `$${transformsBasicPrice}`,
    );

    await userEvent.click(screen.getByRole("radio", { name: /SQL \+ Python/ }));
    expect(screen.getByTestId("due-today-amount")).toHaveTextContent(
      `$${transformsAdvancedPrice}`,
    );
  });

  it("shows due today as $0 and trial heading when trial is available", async () => {
    setup({ isHosted: true, isStoreUser: true, trialDays: 13 });

    await waitForLoadingToFinish();

    expect(
      screen.getByRole("heading", {
        name: "Start a free 13-day trial of transforms",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("due-today-amount")).toHaveTextContent(`$0`);
  });
});
