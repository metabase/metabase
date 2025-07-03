import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { SdkIframeEmbedSetup } from "./SdkIframeEmbedSetup";

const setup = () => renderWithProviders(<SdkIframeEmbedSetup />);

describe("Embed flow > initial setup", () => {
  it("shows the embed experience step as the first step", () => {
    setup();

    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();
  });

  it("selects the dashboard experience by default", () => {
    setup();

    const dashboardRadio = screen.getByRole("radio", { name: /Dashboard/ });
    expect(dashboardRadio).toBeChecked();
  });
});

describe("Embed flow > forward and backward navigation", () => {
  it("navigates forward through the embed flow", async () => {
    setup();

    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("select entity placeholder")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("select embed options placeholder"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get Code" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Get Code" }));
    expect(screen.getByText("get code placeholder")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get Code" }),
    ).not.toBeInTheDocument();
  });

  it("navigates backward to the previous step", async () => {
    setup();

    // Select embed type > select entity > select embed options
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("select embed options placeholder"),
    ).toBeInTheDocument();

    // Back to select entity
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("select entity placeholder")).toBeInTheDocument();

    // Back to select embed type
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("skips the 'select entity' step for exploration", async () => {
    setup();

    await userEvent.click(screen.getByRole("radio", { name: /Exploration/ }));

    // Clicking next skips "select entity" and go directly to "select embed options"
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("select embed options placeholder"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("select entity placeholder"),
    ).not.toBeInTheDocument();
  });
});
