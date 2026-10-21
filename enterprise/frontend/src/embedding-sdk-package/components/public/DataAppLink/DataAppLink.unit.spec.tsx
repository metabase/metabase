import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataAppLink } from "./DataAppLink";

interface SetupOpts {
  pathname: string;
}

const setup = ({ pathname }: SetupOpts) => {
  window.history.replaceState(null, "", pathname);

  render(<DataAppLink to="/customers/42">Customer</DataAppLink>);

  return { link: screen.getByRole("link", { name: "Customer" }) };
};

describe("DataAppLink", () => {
  it("links to the app's page, so opening it in a new tab shows the app", () => {
    const { link } = setup({ pathname: "/embed/apps/sales/orders" });

    expect(link).toHaveAttribute("href", "/apps/sales/customers/42");
  });

  it("keeps a subpath install's root in the link", () => {
    const { link } = setup({ pathname: "/mb/embed/apps/sales/orders" });

    expect(link).toHaveAttribute("href", "/mb/apps/sales/customers/42");
  });

  it("links to the bare sub-path in the dev preview", () => {
    const { link } = setup({ pathname: "/orders" });

    expect(link).toHaveAttribute("href", "/customers/42");
  });

  it("navigates within the app's frame on a plain click", async () => {
    const { link } = setup({ pathname: "/embed/apps/sales/orders" });

    await userEvent.click(link);

    expect(window.location.pathname).toBe("/embed/apps/sales/customers/42");
  });
});
