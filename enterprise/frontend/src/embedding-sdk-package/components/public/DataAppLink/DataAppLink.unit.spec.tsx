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
  it.each(["/embed/apps/sales", "/embed/embedded-apps/sales"])(
    "links from %s to the app page for opening in a new tab",
    (prefix) => {
      const { link } = setup({ pathname: `${prefix}/orders` });

      expect(link).toHaveAttribute("href", "/apps/sales/customers/42");
    },
  );

  it.each(["/mb/embed/apps/sales", "/mb/embed/embedded-apps/sales"])(
    "keeps the install root in page links from %s",
    (prefix) => {
      const { link } = setup({ pathname: `${prefix}/orders` });

      expect(link).toHaveAttribute("href", "/mb/apps/sales/customers/42");
    },
  );

  it("links to the bare sub-path in the dev preview", () => {
    const { link } = setup({ pathname: "/orders" });

    expect(link).toHaveAttribute("href", "/customers/42");
  });

  it.each([
    "/embed/apps/sales",
    "/mb/embed/apps/sales",
    "/embed/embedded-apps/sales",
    "/mb/embed/embedded-apps/sales",
  ])("keeps plain-click navigation inside %s", async (prefix) => {
    const { link } = setup({ pathname: `${prefix}/orders` });

    await userEvent.click(link);

    expect(window.location.pathname).toBe(`${prefix}/customers/42`);
  });
});
