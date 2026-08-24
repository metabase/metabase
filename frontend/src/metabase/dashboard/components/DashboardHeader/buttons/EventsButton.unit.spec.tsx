import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import type { DashboardSidebarState } from "metabase/redux/store";
import { createMockDashboardState } from "metabase/redux/store/mocks";

import { EventsButton } from "./EventsButton";

function setup(sidebar: DashboardSidebarState = { props: {} }) {
  const { store } = renderWithProviders(
    <MockDashboardContext>
      <EventsButton />
    </MockDashboardContext>,
    {
      storeInitialState: {
        dashboard: createMockDashboardState({ sidebar }),
      },
    },
  );
  return { store };
}

const getSidebar = (store: ReturnType<typeof setup>["store"]) =>
  store.getState().dashboard.sidebar;

describe("EventsButton", () => {
  it("opens the dashboard-wide events sidebar", async () => {
    const { store } = setup();

    await userEvent.click(screen.getByLabelText("Events"));

    expect(getSidebar(store)).toEqual({
      name: SIDEBAR_NAME.events,
      props: {},
    });
  });

  it("switches a dashcard-scoped events sidebar to the dashboard-wide one instead of closing", async () => {
    const { store } = setup({
      name: SIDEBAR_NAME.events,
      props: { dashcardId: 1 },
    });

    await userEvent.click(screen.getByLabelText("Events"));

    expect(getSidebar(store)).toEqual({
      name: SIDEBAR_NAME.events,
      props: {},
    });
  });

  it("closes the dashboard-wide events sidebar", async () => {
    const { store } = setup({ name: SIDEBAR_NAME.events, props: {} });

    await userEvent.click(screen.getByLabelText("Events"));

    expect(getSidebar(store)).toEqual({ props: {} });
  });
});
