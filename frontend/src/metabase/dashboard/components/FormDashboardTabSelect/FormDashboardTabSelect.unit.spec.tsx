import userEvent from "@testing-library/user-event";

import { setupDashboardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import type { DashboardId, DashboardTabId } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { FormDashboardTabSelect } from "./FormDashboardTabSelect";

const FOO_TAB_1 = createMockDashboardTab({ id: 1, name: "Foo Tab 1" });
const FOO_TAB_2 = createMockDashboardTab({ id: 2, name: "Foo Tab 2" });
const FOO_DASH = createMockDashboard({
  id: 1,
  collection_id: 1,
  name: "Foo Dashboard",
  tabs: [FOO_TAB_1, FOO_TAB_2],
});

const BAR_DASH = createMockDashboard({
  id: 2,
  collection_id: 1,
  name: "Bar Dashboard",
  tabs: [],
});

const BAZ_TAB_1 = createMockDashboardTab({ id: 3, name: "Baz Tab 1" });
const BAZ_TAB_2 = createMockDashboardTab({ id: 4, name: "Baz Tab 2" });
const BAZ_DASH = createMockDashboard({
  id: 3,
  collection_id: 1,
  name: "Baz Dashboard",
  tabs: [BAZ_TAB_1, BAZ_TAB_2],
});

const setup = async (options: {
  dashboardId: DashboardId;
  initialValue?: DashboardTabId;
}) => {
  setupDashboardEndpoints(FOO_DASH);
  setupDashboardEndpoints(BAR_DASH);
  setupDashboardEndpoints(BAZ_DASH);

  const onSubmit = jest.fn();

  const formProviderProps = {
    initialValues: { dashboard_tab_id: options.initialValue ?? {} },
    onSubmit,
  };

  const selectProps = {
    name: "dashboard_tab_id",
    label: "Which tab should this go on?",
    dashboardId: options.dashboardId,
  };

  const { rerender: _rerender } = renderWithProviders(
    <FormProvider {...formProviderProps}>
      <Form>
        <FormDashboardTabSelect {...selectProps} />
        <FormSubmitButton />
      </Form>
    </FormProvider>,
  );

  const rerender = (dashboardId: DashboardId) => {
    _rerender(
      <FormProvider {...formProviderProps}>
        <Form>
          <FormDashboardTabSelect {...selectProps} dashboardId={dashboardId} />,
          <FormSubmitButton />
        </Form>
      </FormProvider>,
    );
  };

  return { onSubmit, rerender };
};

describe("FormDashboardTabSelect", () => {
  it("should show the initial value", async () => {
    const { onSubmit } = await setup({
      dashboardId: FOO_DASH.id,
      initialValue: FOO_TAB_1.id,
    });

    await waitForTabSelector(FOO_TAB_1.name);
    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      { dashboard_tab_id: String(FOO_TAB_1.id) },
      expect.anything(),
    );
  });

  it("should be able to select a different tab", async () => {
    const { onSubmit } = await setup({ dashboardId: FOO_DASH.id });
    await waitFor(async () => {
      expect(
        await screen.findByLabelText(/Which tab should this go on/),
      ).toHaveValue(FOO_TAB_1.name);
    });

    await userEvent.click(
      await screen.findByLabelText(/Which tab should this go on/),
    );
    await userEvent.click(await screen.findByText(FOO_TAB_2.name));

    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      { dashboard_tab_id: String(FOO_TAB_2.id) },
      expect.anything(),
    );
  });

  it("should not render if dashboard has no tabs", async () => {
    await setup({ dashboardId: BAR_DASH.id });
    expect(
      screen.queryByText("/Which tab should this go on/"),
    ).not.toBeInTheDocument();
  });

  it("should render if dashboard changes to one with tabs", async () => {
    const { rerender, onSubmit } = await setup({ dashboardId: BAR_DASH.id });

    await waitFor(() => {
      expect(
        screen.queryByText(/Which tab should this go on/),
      ).not.toBeInTheDocument();
    });
    rerender(FOO_DASH.id);
    await waitForTabSelector(FOO_TAB_1.name);

    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      { dashboard_tab_id: String(FOO_TAB_1.id) },
      expect.anything(),
    );
  });

  it("should clear value if dashboard changes to one without tabs", async () => {
    const { rerender, onSubmit } = await setup({ dashboardId: FOO_DASH.id });

    expect(
      await screen.findByText(/Which tab should this go on/),
    ).toBeInTheDocument();

    rerender(BAR_DASH.id);

    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      { dashboard_tab_id: undefined },
      expect.anything(),
    );
  });

  it("should update value to tab in new dashboard if dashboard changes", async () => {
    const { rerender, onSubmit } = await setup({ dashboardId: FOO_DASH.id });
    await waitFor(async () => {
      expect(
        await screen.findByLabelText(/Which tab should this go on/),
      ).toHaveValue(FOO_TAB_1.name);
    });

    rerender(BAZ_DASH.id);
    await waitFor(async () => {
      expect(
        await screen.findByLabelText(/Which tab should this go on/),
      ).toHaveValue(BAZ_TAB_1.name);
    });

    await userEvent.click(screen.getByText("Submit"));
    expect(onSubmit).toHaveBeenCalledWith(
      { dashboard_tab_id: String(BAZ_TAB_1.id) },
      expect.anything(),
    );
  });
});

async function waitForTabSelector(tabName: string) {
  await waitFor(async () => {
    expect(
      await screen.findByLabelText(/Which tab should this go on/),
    ).toHaveValue(tabName);
  });
}
