import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { CreateLibraryDashboardModal } from ".";

const DASHBOARDS_COLLECTION = createMockCollection({
  id: 3,
  name: "Dashboards",
  type: "library-dashboards",
  is_library_root: true,
  can_write: true,
});

function setup() {
  const onClose = jest.fn();
  fetchMock.get(
    `path:/api/collection/${DASHBOARDS_COLLECTION.id}`,
    DASHBOARDS_COLLECTION,
  );
  fetchMock.get("path:/api/collection/root", createMockCollection());
  fetchMock.post("path:/api/dashboard", (call) =>
    createMockDashboard({
      ...JSON.parse(String(call.options.body)),
      id: 42,
    }),
  );

  const { router } = renderWithProviders(
    <CreateLibraryDashboardModal
      opened
      collectionId={DASHBOARDS_COLLECTION.id}
      onClose={onClose}
    />,
    { withRouter: true },
  );

  return { onClose, router };
}

describe("CreateLibraryDashboardModal", () => {
  it("preselects the Dashboards collection", async () => {
    setup();

    expect(await screen.findByText("Dashboards")).toBeInTheDocument();
  });

  it("creates the dashboard in the Library and opens it in the main app", async () => {
    const { router } = setup();

    await userEvent.type(screen.getByLabelText("Name"), "Sales");
    await userEvent.type(screen.getByLabelText("Description"), "Revenue");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(router?.location).toMatchObject({
        pathname: "/dashboard/42-sales",
        hash: "#edit",
      }),
    );
    expect(
      await fetchMock.callHistory
        .lastCall("path:/api/dashboard")
        ?.request?.json(),
    ).toEqual({
      name: "Sales",
      description: "Revenue",
      collection_id: DASHBOARDS_COLLECTION.id,
    });
  });

  it("calls onClose when Cancel is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
  });
});
