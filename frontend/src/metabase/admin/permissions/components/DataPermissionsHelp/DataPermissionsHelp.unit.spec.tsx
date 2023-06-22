import { screen } from "@testing-library/react";
import { DataPermissionsHelp } from "metabase/admin/permissions/components/DataPermissionsHelp/DataPermissionsHelp";
import { mockSettings } from "__support__/settings";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { renderWithProviders, waitForElementToBeRemoved } from "__support__/ui";

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

  await waitForElementToBeRemoved(() => screen.queryByText("Loading..."));
}

describe("DataPermissionsHelp", function () {
  it("shows link to the plans page on non-enterprise instances", () => {
    setup({ hasAdvancedPermissions: false });

    screen
      .queryAllByText("Only available in certain Metabase plans.")
      .every(element => {
        expect(element).toBeInTheDocument();
      });

    screen.getAllByText("Upgrade to Pro").every(link => {
      expect(link).toHaveAttribute(
        "href",
        "https://www.metabase.com/upgrade?utm_media=admin_permissions&utm_source=oss",
      );
    });
  });

  it("does not show the link to the plans page on enterprise instances", () => {
    setup({ hasAdvancedPermissions: true });

    expect(
      screen.queryByText("Only available in certain Metabase plans."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Pro")).not.toBeInTheDocument();
  });
});
