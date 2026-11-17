import userEvent from "@testing-library/user-event";

import { renderWithRegisterActionsSpy } from "__support__/kbar";
import {
  MockDashboardContext,
  type MockDashboardContextProps,
} from "metabase/dashboard/context/mock-context";
import type { Dashboard } from "metabase-types/api";
import { createMockDashboard } from "metabase-types/api/mocks";

import { EditDashboardButton } from "./EditDashboardButton";

const SHORTCUT_ID = "dashboard-edit";

type SetupOpts = {
  dashboard: Dashboard;
};

const setup = ({ dashboard }: SetupOpts) => {
  const setEditingDashboard = jest.fn<
    ReturnType<NonNullable<MockDashboardContextProps["setEditingDashboard"]>>,
    Parameters<NonNullable<MockDashboardContextProps["setEditingDashboard"]>>
  >();
  const onRefreshPeriodChange = jest.fn<
    ReturnType<NonNullable<MockDashboardContextProps["onRefreshPeriodChange"]>>,
    Parameters<NonNullable<MockDashboardContextProps["onRefreshPeriodChange"]>>
  >();

  const renderButton = (dashboard: Dashboard) => (
    <MockDashboardContext
      dashboardId={dashboard.id}
      dashboard={dashboard}
      setEditingDashboard={setEditingDashboard}
      onRefreshPeriodChange={onRefreshPeriodChange}
    >
      <EditDashboardButton />
    </MockDashboardContext>
  );

  const { rerender, getRegistrationsOf } = renderWithRegisterActionsSpy(
    renderButton(dashboard),
  );

  const getShortcutRegistrations = () => getRegistrationsOf(SHORTCUT_ID);

  return {
    rerender: (dashboard: Dashboard) => rerender(renderButton(dashboard)),
    getShortcutRegistrations,
    setEditingDashboard,
    onRefreshPeriodChange,
  };
};

// `e` is the key of the "dashboard-edit" shortcut.
const pressEditKey = () => userEvent.keyboard("e");

describe("EditDashboardButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not re-register the shortcut when the dashboard changes", () => {
    const { rerender, getShortcutRegistrations } = setup({
      dashboard: createMockDashboard({ id: 1, name: "Dashboard A" }),
    });
    expect(getShortcutRegistrations()).toHaveLength(1);

    rerender(createMockDashboard({ id: 1, name: "Dashboard B" }));

    expect(getShortcutRegistrations()).toHaveLength(1);
  });

  it('edits the latest dashboard when "e" is pressed', async () => {
    const dashboardB = createMockDashboard({ id: 1, name: "Dashboard B" });
    const { rerender, setEditingDashboard, onRefreshPeriodChange } = setup({
      dashboard: createMockDashboard({ id: 1, name: "Dashboard A" }),
    });

    rerender(dashboardB);
    await pressEditKey();

    expect(setEditingDashboard).toHaveBeenCalledTimes(1);
    expect(setEditingDashboard).toHaveBeenCalledWith(dashboardB);
    expect(onRefreshPeriodChange).toHaveBeenCalledTimes(1);
    expect(onRefreshPeriodChange).toHaveBeenCalledWith(null);
  });
});
