import { screen } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";

import { EmailAdmin } from "./EmailAdmin";

describe("EmailAdmin", () => {
  it("should render admin's email as a link (metabase#42929)", async () => {
    renderWithProviders(<EmailAdmin />);

    const link = screen.getByText("admin@metabase.test");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:admin@metabase.test");
  });
});
