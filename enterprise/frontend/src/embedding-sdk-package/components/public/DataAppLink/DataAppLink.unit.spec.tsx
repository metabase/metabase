import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataAppLink, type DataAppLinkProps } from "./DataAppLink";

interface SetupOpts {
  pathname: string;
  props?: Partial<DataAppLinkProps>;
}

const setup = ({ pathname, props }: SetupOpts) => {
  window.history.replaceState(null, "", pathname);

  render(
    <DataAppLink to="/customers/42" {...props}>
      Customer
    </DataAppLink>,
  );
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("DataAppLink - internal data apps", () => {
  it.each([
    ["/embed/apps/sales", "/apps/sales/customers/42"],
    ["/mb/embed/apps/sales", "/mb/apps/sales/customers/42"],
    ["", "/customers/42"],
  ])("renders a link from %p to %p", (prefix, href) => {
    setup({ pathname: `${prefix}/orders` });

    expect(screen.getByRole("link", { name: "Customer" })).toHaveAttribute(
      "href",
      href,
    );
  });

  it.each(["/embed/apps/sales", "/mb/embed/apps/sales"])(
    "navigates within the iframe when clicking a link under %s",
    async (prefix) => {
      setup({ pathname: `${prefix}/orders` });

      await userEvent.click(screen.getByRole("link", { name: "Customer" }));

      expect(window.location.pathname).toBe(`${prefix}/customers/42`);
    },
  );

  it("sets attributes for links opened in a new tab", () => {
    setup({
      pathname: "/embed/apps/sales/orders",
      props: { target: "_blank" },
    });

    expect(screen.getByRole("link", { name: "Customer" })).toHaveAttribute(
      "target",
      "_blank",
    );

    expect(screen.getByRole("link", { name: "Customer" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });
});

describe("DataAppLink - embedded data apps", () => {
  it.each(["/embed/embedded-apps/sales", "/mb/embed/embedded-apps/sales"])(
    "renders a button instead of a link and navigates within %s",
    async (prefix) => {
      setup({
        pathname: `${prefix}/orders`,
        props: { target: "_blank", rel: "noopener" },
      });

      const button = screen.getByRole("button", { name: "Customer" });
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toHaveAttribute("href");
      expect(button).not.toHaveAttribute("target");
      expect(button).not.toHaveAttribute("rel");

      await userEvent.click(button);

      expect(window.location.pathname).toBe(`${prefix}/customers/42`);
    },
  );

  it.each([
    { key: "Enter", input: "{Enter}" },
    { key: "Space", input: " " },
  ])("navigates within the iframe when $key is pressed", async ({ input }) => {
    setup({ pathname: "/embed/embedded-apps/sales/orders" });

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Customer" })).toHaveFocus();

    await userEvent.keyboard(input);
    expect(window.location.pathname).toBe(
      "/embed/embedded-apps/sales/customers/42",
    );
  });

  it("navigates within the iframe on ctrl-click", () => {
    setup({ pathname: "/embed/embedded-apps/sales/orders" });

    fireEvent.click(screen.getByRole("button", { name: "Customer" }), {
      ctrlKey: true,
    });

    expect(window.location.pathname).toBe(
      "/embed/embedded-apps/sales/customers/42",
    );
  });

  it("does not navigate when onClick calls preventDefault", async () => {
    setup({
      pathname: "/embed/embedded-apps/sales/orders",
      props: { onClick: (event) => event.preventDefault() },
    });

    await userEvent.click(screen.getByRole("button", { name: "Customer" }));

    expect(window.location.pathname).toBe("/embed/embedded-apps/sales/orders");
  });
});
