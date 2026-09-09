import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";

import { AreaTab } from "./AreaTab";

interface SetupOpts {
  isGated?: boolean;
  isSelected?: boolean;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
}

const TARGET_URL = "/monitor/dependency-diagnostics";

const setup = ({
  isGated = false,
  isSelected = false,
  leftSection,
  rightSection,
}: SetupOpts = {}) => {
  renderWithProviders(
    <>
      <Route
        path="/"
        element={
          <AreaTab
            label="Dependency diagnostics"
            icon="search_check"
            to={TARGET_URL}
            isGated={isGated}
            isSelected={isSelected}
            leftSection={leftSection}
            rightSection={rightSection}
            showLabel
          />
        }
      />
      <Route path={TARGET_URL} element={<div>Target page</div>} />
    </>,
    { withRouter: true },
  );
};

describe("AreaTab", () => {
  it("marks the selected tab as the current page for assistive tech", () => {
    setup({ isSelected: true });

    const tab = screen.getByRole("link", { name: "Dependency diagnostics" });
    expect(tab).toHaveAttribute("aria-current", "page");
  });

  it("does not mark an unselected tab as current", () => {
    setup({ isSelected: false });

    const tab = screen.getByRole("link", { name: "Dependency diagnostics" });
    expect(tab).not.toHaveAttribute("aria-current");
  });

  it("navigates to its target when clicked", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("link", { name: "Dependency diagnostics" }),
    );

    expect(await screen.findByText("Target page")).toBeInTheDocument();
  });

  it("shows an upsell gem for a gated tab", () => {
    setup({ isGated: true });

    expect(screen.getByTestId("upsell-gem")).toBeInTheDocument();
  });

  it("does not show an upsell gem for an ungated tab", () => {
    setup({ isGated: false });

    expect(screen.queryByTestId("upsell-gem")).not.toBeInTheDocument();
  });

  it("shows a custom right section instead of an upsell gem", () => {
    setup({
      isGated: true,
      rightSection: <span data-testid="custom-right-section" />,
    });

    expect(screen.getByTestId("custom-right-section")).toBeInTheDocument();
    expect(screen.queryByTestId("upsell-gem")).not.toBeInTheDocument();
  });

  it("keeps controls in the side sections outside the link and usable without navigating", async () => {
    const onLeftClick = jest.fn();
    const onRightClick = jest.fn();
    setup({
      leftSection: <button onClick={onLeftClick}>Toggle</button>,
      rightSection: <button onClick={onRightClick}>Options</button>,
    });

    const link = screen.getByRole("link", { name: "Dependency diagnostics" });
    const toggle = screen.getByRole("button", { name: "Toggle" });
    const options = screen.getByRole("button", { name: "Options" });
    expect(link).not.toContainElement(toggle);
    expect(link).not.toContainElement(options);

    await userEvent.click(toggle);
    await userEvent.click(options);

    expect(onLeftClick).toHaveBeenCalledTimes(1);
    expect(onRightClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Target page")).not.toBeInTheDocument();
  });
});
