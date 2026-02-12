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

  it("renders 2-column layout with CTA when instance is cloud hosted and user is a store user", async () => {
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

  it("renders 2-column layout with CTA when instance is not cloud hosted", async () => {
    setup({ isHosted: false, isStoreUser: true });

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

  it("shows advanced (python) tier only when they already have basic transforms", async () => {
    setup({ isHosted: true, isStoreUser: true, hasBasicTransforms: true });

    await waitForLoadingToFinish();

    expect(screen.queryByText(/SQL only/)).not.toBeInTheDocument();
    expect(screen.getByText(/SQL \+ Python/)).toBeInTheDocument();
    expect(screen.getByTestId("due-today-amount")).toHaveTextContent(
      `$${transformsAdvancedPrice}`,
    );
  });

  it("shows both transforms tiers when cloud user is on trial", async () => {
    setup({ isHosted: true, isStoreUser: true, isOnTrial: true });

    await waitForLoadingToFinish();

    expect(screen.getByText(/SQL only/)).toBeInTheDocument();
    expect(screen.getByText(/SQL \+ Python/)).toBeInTheDocument();
  });
});
