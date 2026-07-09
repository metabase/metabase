import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DataAppAllowedHosts } from "./DataAppAllowedHosts";

describe("DataAppAllowedHosts", () => {
  it("shows 'None' when there are no allowed hosts", () => {
    renderWithProviders(<DataAppAllowedHosts hosts={[]} />);

    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.queryByText(/Allowed hosts \(/)).not.toBeInTheDocument();
  });

  it("lists the hosts behind a collapsible toggle", async () => {
    renderWithProviders(
      <DataAppAllowedHosts
        hosts={["https://api.example.com", "https://*.acme.com"]}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Allowed hosts \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    expect(screen.getByText("https://api.example.com")).toBeInTheDocument();
    expect(screen.getByText("https://*.acme.com")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
