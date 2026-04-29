import { createScenario } from "__support__/scenarios";
import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import { DataPermissionsHelp } from "metabase/admin/permissions/components/DataPermissionsHelp/DataPermissionsHelp";

async function setup({ hasAdvancedPermissions = false } = {}) {
  const { render } = createScenario()
    .withEnterprise({
      tokenFeatures: { advanced_permissions: hasAdvancedPermissions },
    })
    .build();

  render(<DataPermissionsHelp />);

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
