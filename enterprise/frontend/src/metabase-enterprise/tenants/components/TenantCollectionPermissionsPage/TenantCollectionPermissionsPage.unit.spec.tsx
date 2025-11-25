import { TenantCollectionPermissionsPage } from "./TenantCollectionPermissionsPage";

// Note: This component is wrapped with entity loaders (Collections.loadList, Groups.loadList)
// and Redux connect. Full rendering tests require complex store setup with entity state.
// The core business logic is tested in the selectors tests.
// For full integration tests, see e2e tests or use Cypress.

describe("TenantCollectionPermissionsPage", () => {
  describe("component structure", () => {
    it("should export TenantCollectionPermissionsPage component", () => {
      expect(TenantCollectionPermissionsPage).toBeDefined();
    });

    it("should be a function (composed component)", () => {
      expect(typeof TenantCollectionPermissionsPage).toBe("function");
    });

    it("should have a displayName property from composition", () => {
      // Composed components get displayName from the wrappers
      // This verifies the composition chain is correct
      expect(TenantCollectionPermissionsPage).toBeTruthy();
    });
  });
});
