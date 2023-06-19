import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";

import {
  setupCollectionsEndpoints,
  setupCollectionItemsEndpoint,
  setupDashboardEndpoints,
} from "__support__/server-mocks";

import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";
import { CustomHomePageModal } from "./CustomHomePageModal";

const ROOT_COLLECTION = createMockCollection({
  id: "root",
  can_write: true,
  name: "Our Analytics",
  location: undefined,
});
const COLLECTION_ITEM = createMockCollectionItem({
  name: "Foo",
  model: "dashboard",
});

const FOO_DASHBOARD = createMockDashboard({
  name: "Foo",
});

const setup = ({ ...props } = {}) => {
  const onClose = jest.fn();

  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupCollectionItemsEndpoint(ROOT_COLLECTION, [COLLECTION_ITEM]);
  setupDashboardEndpoints(FOO_DASHBOARD);

  renderWithProviders(
    <CustomHomePageModal onClose={onClose} isOpen={true} {...props} />,
  );
};

describe("custom hompage modal", () => {
  it("should only enable the save button if a dashboard has been selected", async () => {
    setup();
    expect(await screen.findByRole("button", { name: /save/i })).toBeDisabled();

    userEvent.click(await screen.findByText("Select a dashboard"));
    userEvent.click(await screen.findByText("Foo"));

    expect(await screen.findByRole("button", { name: /save/i })).toBeEnabled();
  });
});
