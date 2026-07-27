import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route } from "metabase/router";

import { type ModalComponentProps, modalRoute } from "./ModalRoute";

function CollectionPage() {
  return (
    <div>
      <span>Collection page</span>
      <Outlet />
    </div>
  );
}

function TestModal({ params, onClose }: ModalComponentProps) {
  return (
    <div>
      <span>Modal for {params.slug ?? params.pulseId}</span>
      <button onClick={onClose}>Close</button>
    </div>
  );
}

const modalProps = { transitionProps: { duration: 0 } };

function setup(routes: React.ReactNode, initialRoute: string) {
  const { history } = renderWithProviders(<>{routes}</>, {
    withRouter: true,
    initialRoute,
  });

  const pathname = () => history?.getCurrentLocation().pathname;
  return { pathname };
}

const close = () =>
  userEvent.click(screen.getByRole("button", { name: "Close" }));

describe("modalRoute", () => {
  it("renders the page and the modal when deep-linking to a modal URL", () => {
    setup(
      <Route path="collection/:slug" element={<CollectionPage />}>
        {modalRoute("archive", TestModal, { modalProps })}
      </Route>,
      "/collection/5/archive",
    );

    expect(screen.getByText("Collection page")).toBeInTheDocument();
    expect(screen.getByText("Modal for 5")).toBeInTheDocument();
  });

  it("returns to the parent URL on close", async () => {
    const { pathname } = setup(
      <Route path="collection/:slug" element={<CollectionPage />}>
        {modalRoute("archive", TestModal, { modalProps })}
      </Route>,
      "/collection/5/archive",
    );

    await close();

    expect(pathname()).toBe("/collection/5");
    expect(screen.queryByText("Modal for 5")).not.toBeInTheDocument();
    expect(screen.getByText("Collection page")).toBeInTheDocument();
  });

  it("closes a modal whose path spans several segments to the right parent", async () => {
    const { pathname } = setup(
      <Route path="account/notifications" element={<CollectionPage />}>
        {modalRoute("pulse/:pulseId/archive", TestModal, { modalProps })}
      </Route>,
      "/account/notifications/pulse/7/archive",
    );

    expect(screen.getByText("Modal for 7")).toBeInTheDocument();

    await close();

    expect(pathname()).toBe("/account/notifications");
  });

  // The admin permissions pages hang modal routes off a parent that matches a
  // variable number of segments. v3 spelled that with optional groups
  // (`database(/:databaseId)`); v7 cannot parse those, so the app expands each
  // depth into its own route. Closing has to land on the depth that matched.
  it("closes to the right parent under a variable-depth parent route", async () => {
    const { pathname } = setup(
      <Route path="database/:databaseId" element={<CollectionPage />}>
        {modalRoute("impersonated/group/:groupId", TestModal, { modalProps })}
      </Route>,
      "/database/1/impersonated/group/2",
    );

    expect(screen.getByText("Collection page")).toBeInTheDocument();

    await close();

    expect(pathname()).toBe("/database/1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("wraps the modal component in a dialog by default", () => {
    setup(
      <Route path="collection/:slug" element={<CollectionPage />}>
        {modalRoute("archive", TestModal, { modalProps })}
      </Route>,
      "/collection/5/archive",
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the modal component on its own with noWrap", () => {
    setup(
      <Route path="collection/:slug" element={<CollectionPage />}>
        {modalRoute("archive", TestModal, { noWrap: true })}
      </Route>,
      "/collection/5/archive",
    );

    expect(screen.getByText("Modal for 5")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
