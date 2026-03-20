import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCollectionTreeEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import { MoveDashboardStepContent } from "./MoveDashboardStepContent";

const SHARED_COLLECTION = createMockCollection({
  id: 42,
  name: "Shared collection",
});

const XRAY_DASHBOARD = createMockCollectionItem({
  id: 200,
  name: "A look at Invoices",
  model: "dashboard",
});

function setup({
  isMoveDashboardDone = false,
  hasXrayDashboard = false,
}: {
  isMoveDashboardDone?: boolean;
  hasXrayDashboard?: boolean;
} = {}) {
  const onCompleted = jest.fn();
  const lastDashboard = hasXrayDashboard ? XRAY_DASHBOARD : null;

  // Shared tenant collections tree (still needed for sharedCollectionId)
  setupCollectionTreeEndpoint([SHARED_COLLECTION]);

  if (hasXrayDashboard) {
    // DashboardSelector fetches the dashboard details
    fetchMock.get("path:/api/dashboard/200", {
      id: 200,
      name: "A look at Invoices",
      collection_id: 99,
      dashcards: [],
    });
  }

  renderWithProviders(
    <MoveDashboardStepContent
      isMoveDashboardDone={isMoveDashboardDone}
      hasXrayDashboard={hasXrayDashboard}
      lastDashboard={lastDashboard}
      onCompleted={onCompleted}
    />,
  );

  return { onCompleted };
}

describe("MoveDashboardStepContent", () => {
  it('shows "Continue" when shared collection already has dashboards', async () => {
    setup({ isMoveDashboardDone: true });

    expect(await screen.findByText("Continue")).toBeInTheDocument();
    expect(
      screen.queryByText("Move to shared collection"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Create a sample dashboard"),
    ).not.toBeInTheDocument();
  });

  it('shows only "Create a sample dashboard" when no xray dashboard exists', async () => {
    setup({ hasXrayDashboard: false });

    expect(
      await screen.findByText("Create a sample dashboard"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Move to shared collection"),
    ).not.toBeInTheDocument();
  });

  it('shows both "Move" and "Create" when xray dashboard exists', async () => {
    setup({ hasXrayDashboard: true });

    expect(
      await screen.findByText("Move to shared collection"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create a sample dashboard")).toBeInTheDocument();
  });

  it("moves dashboard to shared collection when Move button is clicked", async () => {
    fetchMock.put("path:/api/dashboard/200", 200);

    const { onCompleted } = setup({ hasXrayDashboard: true });

    const moveButton = await screen.findByText("Move to shared collection");
    await userEvent.click(moveButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/dashboard/200", {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    const lastCall = fetchMock.callHistory.lastCall("path:/api/dashboard/200", {
      method: "PUT",
    });
    expect(await lastCall?.request?.json()).toEqual(
      expect.objectContaining({ collection_id: 42 }),
    );

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalled();
    });
  });

  it("creates a sample dashboard when Create button is clicked", async () => {
    fetchMock.post("path:/api/dashboard", {
      id: 999,
      name: "Sample dashboard",
      collection_id: 42,
      dashcards: [],
    });
    fetchMock.put("path:/api/dashboard/999", 200);

    const { onCompleted } = setup({ hasXrayDashboard: false });

    const createButton = await screen.findByText("Create a sample dashboard");
    await userEvent.click(createButton);

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/dashboard", { method: "POST" }),
      ).toHaveLength(1);
    });

    const postCall = fetchMock.callHistory.lastCall("path:/api/dashboard", {
      method: "POST",
    });
    expect(await postCall?.request?.json()).toEqual(
      expect.objectContaining({ name: "Sample dashboard", collection_id: 42 }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls("path:/api/dashboard/999", {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalled();
    });
  });
});
