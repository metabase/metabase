import userEvent from "@testing-library/user-event";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks/state";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { MainPane } from "./MainPane";

const databases = [createMockDatabase({ id: 1, name: "Sample Database" })];

const setup = ({ hasLibrary = false }: { hasLibrary?: boolean } = {}) => {
  const onItemClick = jest.fn();

  setupDatabasesEndpoints(databases, { hasSavedQuestions: false });

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: hasLibrary }),
    }),
  });

  if (hasLibrary) {
    setupEnterpriseOnlyPlugin("library");
  }

  renderWithProviders(
    <MainPane
      onItemClick={onItemClick}
      onClose={jest.fn()}
      onBack={jest.fn()}
    />,
    { storeInitialState: state },
  );

  return { onItemClick };
};

describe("MainPane", () => {
  afterEach(() => {
    reinitialize();
  });

  it("does not render a Library option when the library feature is disabled", async () => {
    setup({ hasLibrary: false });

    expect(await screen.findByText("Sample Database")).toBeInTheDocument();
    expect(screen.queryByText("Library")).not.toBeInTheDocument();
  });

  it("renders a Library option that opens the library pane when the feature is enabled", async () => {
    const { onItemClick } = setup({ hasLibrary: true });

    await userEvent.click(await screen.findByText("Library"));

    expect(onItemClick).toHaveBeenCalledWith({ type: "library" });
  });
});
