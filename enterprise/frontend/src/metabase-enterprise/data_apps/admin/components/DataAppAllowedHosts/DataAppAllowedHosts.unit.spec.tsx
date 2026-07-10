import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DataAppAllowedHosts } from "./DataAppAllowedHosts";

describe("DataAppAllowedHosts", () => {
  it("renders nothing when there are no allowed hosts", () => {
    renderWithProviders(<DataAppAllowedHosts hosts={[]} />);

    expect(screen.queryByText(/allowed host/)).not.toBeInTheDocument();
  });

  it("shows a singular label for a single host", () => {
    renderWithProviders(
      <DataAppAllowedHosts hosts={["https://api.example.com"]} />,
    );

    expect(screen.getByText("1 allowed host")).toBeInTheDocument();
  });

  it("shows a pluralized count and reveals the hosts on hover", async () => {
    renderWithProviders(
      <DataAppAllowedHosts
        hosts={["https://api.example.com", "https://*.acme.com"]}
      />,
    );

    const label = screen.getByText("2 allowed hosts");
    expect(label).toBeInTheDocument();

    // The origins live in a hover card that opens on pointer hover.
    await userEvent.hover(label);

    expect(
      await screen.findByText("https://api.example.com"),
    ).toBeInTheDocument();
    expect(screen.getByText("https://*.acme.com")).toBeInTheDocument();
  });
});
