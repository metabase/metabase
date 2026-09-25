import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadataFromState } from "__support__/metadata";
import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Menu } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import {
  DataPermissionValue,
  type DownloadPermission,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { CardEmbedMenuDropdown } from "./CardEmbedMenuDropdown";

const CARD = createMockCard({ id: 1, name: "Orders" });

const WRITE_ONLY_ITEMS = [
  "Add supporting text",
  "Edit Visualization",
  "Edit Query",
  "Replace",
  "Remove Chart",
];

type SetupOpts = {
  canWrite: boolean;
  downloadPerms?: DownloadPermission;
};

function setup({
  canWrite,
  downloadPerms = DataPermissionValue.FULL,
}: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({ questions: [CARD] }),
  });
  const question = checkNotNull(
    createMockMetadataFromState(state).question(CARD.id),
  );
  const dataset = createMockDataset({
    data: createMockDatasetData({ download_perms: downloadPerms }),
  });

  setupLastDownloadFormatEndpoints();

  const TestMenu = () => {
    const [menuView, setMenuView] = useState<string | null>(null);
    return (
      <Menu opened>
        <Menu.Target>
          <button>menu</button>
        </Menu.Target>
        <Menu.Dropdown>
          <CardEmbedMenuDropdown
            canWrite={canWrite}
            dataset={dataset}
            question={question}
            isNativeQuestion={false}
            commentsPath="/document/1/comments/abc"
            hasUnsavedChanges={false}
            isStatic={false}
            handleDownload={jest.fn()}
            handleEditVisualizationSettings={jest.fn()}
            setIsModifyModalOpen={jest.fn()}
            handleReplaceQuestion={jest.fn()}
            handleRemoveNode={jest.fn()}
            handleAddSupportingText={jest.fn()}
            menuView={menuView}
            setMenuView={setMenuView}
            isDownloadingData={false}
          />
        </Menu.Dropdown>
      </Menu>
    );
  };

  renderWithProviders(<TestMenu />, {
    storeInitialState: state,
    withRouter: true,
  });
}

const getMenuItem = (name: string) =>
  screen.getByRole("menuitem", { name: new RegExp(name) });

async function expectDownloadFormats() {
  await userEvent.click(getMenuItem("Download results"));
  expect(await screen.findByText(".csv")).toBeInTheDocument();
  const menu = screen.getByRole("menu");
  expect(within(menu).getByText(".xlsx")).toBeInTheDocument();
  expect(within(menu).getByText(".json")).toBeInTheDocument();
}

describe("CardEmbedMenuDropdown", () => {
  afterEach(() => {
    reinitialize();
  });

  it("enables every action, including downloads, for people who can edit the document", async () => {
    setup({ canWrite: true });

    [...WRITE_ONLY_ITEMS, "Download results"].forEach((name) =>
      expect(getMenuItem(name)).toBeEnabled(),
    );
    const commentItem = getMenuItem("Comment");
    expect(commentItem).toHaveAttribute("href", "/document/1/comments/abc");
    expect(commentItem).not.toHaveAttribute("data-disabled");

    await expectDownloadFormats();
  });

  it("only enables downloads for people with read-only access to the document", async () => {
    setup({ canWrite: false });

    WRITE_ONLY_ITEMS.forEach((name) =>
      expect(getMenuItem(name)).toBeDisabled(),
    );
    expect(
      screen.queryByRole("menuitem", { name: /Comment/ }),
    ).not.toBeInTheDocument();
    expect(getMenuItem("Download results")).toBeEnabled();

    await expectDownloadFormats();
  });

  it("hides downloads when the person has no download permission for the data", () => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        advanced_permissions: true,
      }),
    });
    setupEnterpriseOnlyPlugin("feature_level_permissions");

    setup({ canWrite: false, downloadPerms: DataPermissionValue.NONE });

    expect(getMenuItem("Remove Chart")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /Download results/ }),
    ).not.toBeInTheDocument();
  });
});
