import userEvent from "@testing-library/user-event";

import {
  setupDatabaseListEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  getIcon,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";
import type { ModularEmbeddingEntityType } from "metabase-types/store/embedding-data-picker";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEmbeddingDataPickerState } from "metabase-types/store/mocks/embedding-data-picker";

import { BrowseNavSection } from "./BrowseNavSection";

describe("BrowseNavSection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render a section title and an 'Add data' button", async () => {
    setup({ isAdmin: true });

    const section = screen.getByRole("section", { name: "Data" });

    expect(section).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      await within(section).findByRole("button", { name: "Add data" }),
    ).toBeInTheDocument();
  });

  it("should not render a section title and an 'Add data' button for users without enough permissions", async () => {
    setup({ isAdmin: false });

    const section = screen.getByRole("section", { name: "Data" });

    expect(section).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Add data" }),
    ).not.toBeInTheDocument();
  });

  it("should not render the 'Add data' button for full app embedding", () => {
    setup({ isEmbeddingIframe: true });

    const section = screen.getByRole("section", { name: "Data" });

    expect(section).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { name: "Data" }),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: "Add data" }),
    ).not.toBeInTheDocument();
  });

  it("should be expanded by default but collapsible", async () => {
    setup();

    const section = screen.getByRole("section", { name: "Data" });
    const addDataButton = within(section).getByRole("button", {
      name: "Add data",
    });
    const toggle = within(section).getByRole("button", { name: /Data/ });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getByRole("region")).toBeInTheDocument();

    expect(addDataButton).toBeInTheDocument();
    expect(getIcon("chevrondown")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();
    expect(screen.getByText("Databases")).toBeInTheDocument();
    expect(screen.getByText("Metrics")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(section).queryByRole("region")).not.toBeInTheDocument();

    expect(addDataButton).toBeInTheDocument();
    expect(getIcon("chevronright")).toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("Databases")).not.toBeInTheDocument();
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
  });

  it("clicking the 'Add data' button triggers the modal", async () => {
    const { onAddDataModalOpen } = await setup();

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
  entityTypes?: ModularEmbeddingEntityType[];
  isAdmin?: boolean;
}

async function setup({
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
  setupUpdateSettingEndpoint();

  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  const embeddingDataPickerState = entityTypes
    ? {
        embeddingDataPicker: createMockEmbeddingDataPickerState({
          entityTypes,
        }),
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

  await waitFor(() =>
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(),
  );

  return { onAddDataModalOpen };
}
