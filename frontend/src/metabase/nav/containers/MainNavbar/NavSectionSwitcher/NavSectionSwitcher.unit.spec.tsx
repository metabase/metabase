import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { NavSectionSwitcher } from "./NavSectionSwitcher";

function setup(initialRoute: string) {
  const { store, router } = renderWithProviders(<NavSectionSwitcher />, {
    withRouter: true,
    initialRoute,
  });

  const locations: string[] = [];
  router?.onLocationChange((location) => locations.push(location.pathname));

  return { store, router, locations };
}

describe("NavSectionSwitcher", () => {
  it("switches to Official without leaving the current page", async () => {
    const { store, router, locations } = setup("/question/42");

    expect(screen.getByRole("radio", { name: "Unofficial" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Official" }));

    expect(screen.getByRole("radio", { name: "Official" })).toBeChecked();
    expect(store.getState().app.navSection).toBe("official");
    expect(router?.location.pathname).toBe("/question/42");
    expect(locations).toEqual([]);
  });

  it("switches to Unofficial without leaving the current page", async () => {
    const { store, router, locations } = setup("/browse/models");

    expect(screen.getByRole("radio", { name: "Official" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Unofficial" }));

    expect(screen.getByRole("radio", { name: "Unofficial" })).toBeChecked();
    expect(store.getState().app.navSection).toBe("unofficial");
    expect(router?.location.pathname).toBe("/browse/models");
    expect(locations).toEqual([]);
  });
});
