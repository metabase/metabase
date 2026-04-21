import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { DataPermissionsHelp } from "metabase/admin/permissions/components/DataPermissionsHelp/DataPermissionsHelp";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

async function setup({ hasAdvancedPermissions = false } = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      advanced_permissions: hasAdvancedPermissions,
    }),
  });

  renderWithProviders(<DataPermissionsHelp />, {
    storeInitialState: {
      settings,
    },
  });

  await waitForLoaderToBeRemoved();
}

describe("DataPermissionsHelp", () => {
  it("shows all the sections to users with advanced permissions", () => {
    setup({ hasAdvancedPermissions: true });

    [
      "Database ‘View data’ levels",
      "Schema or table ‘View data’ levels",
      "‘Create queries’ levels",
      "Other data permissions",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeVisible();
    });
  });

  it("hides sections to users without advanced permissions", () => {
    setup({ hasAdvancedPermissions: false });
    expect(screen.getByText("‘Create queries’ levels")).toBeInTheDocument();

    [
      "Database ‘View data’ levels",
      "Schema or table ‘View data’ levels",
      "Other data permissions",
    ].forEach((text) => {
      expect(screen.getByText(text)).not.toBeVisible();
    });
  });
});
