import userEvent from "@testing-library/user-event";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { getIcon, renderWithProviders, screen, within } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import type { EmbeddingEntityType } from "metabase-types/store/embedding-data-picker";
import { createMockState } from "metabase-types/store/mocks";

import { BrowseNavSection } from "./BrowseNavSection";

describe("BrowseNavSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render a section title and an 'Add data' button", async () => {
    setup({ isAdmin: true });

    const tab = screen.getByRole("tab");

    expect(tab).toBeInTheDocument();
    expect(
      within(tab).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      await within(tab).findByRole("button", { name: "Add data" }),
    ).toBeInTheDocument();
    // The user-visible text of the button says only "Add"
    expect(within(tab).getByText("Add")).toBeInTheDocument();
  });

  it("should not render a section title and an 'Add data' button for users without enough permissions", async () => {
    setup({ isAdmin: false });

    const tab = screen.getByRole("tab");

    expect(tab).toBeInTheDocument();
    expect(
      within(tab).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      within(tab).queryByRole("button", { name: "Add data" }),
    ).not.toBeInTheDocument();
    // The user-visible text of the button says only "Add"
    expect(within(tab).queryByText("Add")).not.toBeInTheDocument();
  });

  it("should not render the 'Add data' button for full app embedding", () => {
    setup({ isEmbeddingIframe: true });

    const tab = screen.getByRole("tab");

    expect(tab).toBeInTheDocument();
    expect(
      within(tab).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      within(tab).queryByRole("button", { name: "Add data" }),
    ).not.toBeInTheDocument();
  });

  it("should be expanded by default but collapsible", async () => {
    setup();

    const addDataButton = screen.getByRole("button", { name: "Add data" });

    expect(screen.getByRole("tab")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(addDataButton).toBeInTheDocument();
    expect(getIcon("chevrondown")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Databases")).toBeInTheDocument();
    expect(screen.getByText("Metrics")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Data"));
    expect(screen.getByRole("tab")).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();

    expect(addDataButton).toBeInTheDocument();
    expect(getIcon("chevronright")).toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Databases")).not.toBeInTheDocument();
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
  });

  it("clicking the 'Add data' button triggers the modal", async () => {
    const { onAddDataModalOpen } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Add data" }));
    expect(onAddDataModalOpen).toHaveBeenCalledTimes(1);
  });

  it("should render Models, Databases, and Metrics when not embedding in iframe", () => {
    setup();

    expect(
      screen.getByRole("listitem", { name: "Browse models" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Browse databases" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Browse metrics" }),
    ).toBeInTheDocument();
  });

  describe("interactive embedding with `entity_types` (EMB-229)", () => {
    it("should show models and tables when no `entity_types` is provided", () => {
      setup({ isEmbeddingIframe: true });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show models and tables when `entity_types` is `["model", "table"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["model", "table"] });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show only models when `entity_types` is `["model"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["model"] });

      expect(
        screen.getByRole("listitem", { name: "Browse models" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse databases" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });

    it('should show only tables when `entity_types` is `["table"]`', () => {
      setup({ isEmbeddingIframe: true, entityTypes: ["table"] });

      expect(
        screen.queryByRole("listitem", { name: "Browse models" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Browse databases" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Browse metrics" }),
      ).not.toBeInTheDocument();
    });
  });
});

interface SetupOpts {
  isEmbeddingIframe?: boolean;
  entityTypes?: EmbeddingEntityType[];
  isAdmin?: boolean;
}

function setup({
  isEmbeddingIframe,
  entityTypes,
  isAdmin = true,
}: SetupOpts = {}) {
  const onAddDataModalOpen = jest.fn();

  const database = createMockDatabase({
    uploads_enabled: true,
    can_upload: true,
  });
  setupDatabaseListEndpoint([database]);

  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  const embeddingDataPickerState = entityTypes
    ? {
        embeddingDataPicker: {
          entityTypes,
        },
      }
    : undefined;

  const storeInitialState = createMockState({
    ...embeddingDataPickerState,
    currentUser: createMockUser({ is_superuser: isAdmin }),
  });

  renderWithProviders(
    <BrowseNavSection
      hasDataAccess
      /**
       * This prop is required, and this value is grabbed directly from React devtools.
       * I'm not going to dive into why it has to be this value, or why it's needed.
       *
       * From my testing, this doesn't seem to render anything in addition to
       * the 3 items `BrowseNavSection` already renders as a base.
       */
      nonEntityItem={{ type: "non-entity", url: "/" }}
      onItemSelect={jest.fn()}
      onAddDataModalOpen={onAddDataModalOpen}
    />,
    { storeInitialState },
  );

  return { onAddDataModalOpen };
}
