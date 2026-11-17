import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { createMockMetadata } from "__support__/metadata";
import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Menu } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
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

const CARD = createMockCard({ id: 1, name: "Orders", display: "table" });

interface SetupOpts {
  canWrite: boolean;
  downloadPerms?: DownloadPermission;
  hasAdvancedPermissions?: boolean;
}

const MenuDropdownWrapper = ({
  canWrite,
  downloadPerms,
}: Omit<SetupOpts, "hasAdvancedPermissions">) => {
  const [menuView, setMenuView] = useState<string | null>(null);
  const question = new Question(CARD, createMockMetadata({}));
  const dataset = createMockDataset({
    data: createMockDatasetData({ download_perms: downloadPerms }),
  });

  return (
    <Menu opened>
      <Menu.Target>
        <button>ellipsis</button>
      </Menu.Target>
      <Menu.Dropdown>
        <CardEmbedMenuDropdown
          canWrite={canWrite}
          dataset={dataset}
          question={question}
          isNativeQuestion={false}
          commentsPath="/document/1/comments/2"
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

const setup = ({
  canWrite,
  downloadPerms,
  hasAdvancedPermissions = false,
}: SetupOpts) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: hasAdvancedPermissions,
    }),
  });
  if (hasAdvancedPermissions) {
    setupEnterpriseOnlyPlugin("feature_level_permissions");
  }
  setupLastDownloadFormatEndpoints();

  renderWithProviders(
    <MenuDropdownWrapper canWrite={canWrite} downloadPerms={downloadPerms} />,
    {
      withRouter: true,
      storeInitialState: createMockState({ settings }),
    },
  );
};

const getMenu = () => screen.getByRole("menu");

const expectDownloadFormatsAfterClickingDownloadResults = async () => {
  const downloadItem = within(getMenu()).getByRole("menuitem", {
    name: "Download results",
  });
  expect(downloadItem).toBeEnabled();

  await userEvent.click(downloadItem);

  expect(await screen.findByText(".csv")).toBeInTheDocument();
  expect(screen.getByText(".xlsx")).toBeInTheDocument();
  expect(screen.getByText(".json")).toBeInTheDocument();
};

describe("CardEmbedMenuDropdown", () => {
  afterEach(() => {
    reinitialize();
  });

  it("enables every action, including 'Download results', with write access", async () => {
    setup({ canWrite: true });

    [
      /Comment/,
      /Add supporting text/,
      /Edit Visualization/,
      /Edit Query/,
      /Replace/,
      /Download results/,
      /Remove Chart/,
    ].forEach((name) => {
      expect(within(getMenu()).getByRole("menuitem", { name })).toBeEnabled();
    });

    await expectDownloadFormatsAfterClickingDownloadResults();
  });

  it("only enables 'Download results' with read-only access", async () => {
    setup({ canWrite: false });

    [
      /Add supporting text/,
      /Edit Visualization/,
      /Edit Query/,
      /Replace/,
      /Remove Chart/,
    ].forEach((name) => {
      expect(within(getMenu()).getByRole("menuitem", { name })).toBeDisabled();
    });
    expect(
      within(getMenu()).queryByRole("menuitem", { name: /Comment/ }),
    ).not.toBeInTheDocument();
    expect(within(getMenu()).getAllByRole("menuitem")).toHaveLength(6);

    await expectDownloadFormatsAfterClickingDownloadResults();
  });

  it("hides 'Download results' without the download permission", () => {
    setup({
      canWrite: false,
      downloadPerms: DataPermissionValue.NONE,
      hasAdvancedPermissions: true,
    });

    expect(
      within(getMenu()).getByRole("menuitem", { name: /Edit Query/ }),
    ).toBeDisabled();
    expect(
      within(getMenu()).queryByRole("menuitem", { name: "Download results" }),
    ).not.toBeInTheDocument();
  });
});
