import {
  type SheetsPanelState,
  type SheetsPanelStateInput,
  getSheetsPanelState,
} from "./sheets-panel-state";

// A hosted admin with storage, nothing connected yet: status alone decides.
const BASE: SheetsPanelStateInput = {
  isSettingUp: false,
  hasSetupFailed: false,
  isAdmin: true,
  isLoading: false,
  isLoadingStorageAddOn: false,
  hasAttachedDwh: true,
  hasStorageTokenFeature: false,
  showGdrive: true,
  areConnectionDetailsShown: false,
  status: "not-connected",
};

const state = (overrides: Partial<SheetsPanelStateInput>): SheetsPanelState =>
  getSheetsPanelState({ ...BASE, ...overrides });

describe("getSheetsPanelState", () => {
  describe("gating, in precedence order", () => {
    it("shows provisioning ahead of every other gate", () => {
      // Storage is absent mid-provisioning, which alone reads as "buy storage".
      expect(
        state({ isSettingUp: true, hasAttachedDwh: false, isAdmin: false }),
      ).toBe("provisioning-storage");
    });

    it("shows the setup failure ahead of the remaining gates", () => {
      expect(
        state({ hasSetupFailed: true, hasAttachedDwh: false, isAdmin: false }),
      ).toBe("storage-setup-failed");
    });

    it("points a non-admin at their admin rather than at the store", () => {
      expect(state({ isAdmin: false, hasAttachedDwh: false })).toBe(
        "ask-admin",
      );
    });

    it("waits rather than offering storage to an admin whose databases have not arrived", () => {
      // Owning storage and owning none look identical until the list lands.
      expect(state({ isLoading: true, hasAttachedDwh: false })).toBe("loading");
    });

    it("waits rather than blaming Sheets while the service account is still loading", () => {
      expect(state({ isLoading: true, showGdrive: false })).toBe("loading");
    });

    it("answers a non-admin without making them wait", () => {
      // Nothing below the `ask-admin` gate can change their answer.
      expect(state({ isLoading: true, isAdmin: false })).toBe("ask-admin");
    });

    it("keeps showing setup ahead of the loading state", () => {
      expect(state({ isLoading: true, isSettingUp: true })).toBe(
        "provisioning-storage",
      );
      expect(
        state({ isLoading: true, hasSetupFailed: true, hasAttachedDwh: false }),
      ).toBe("storage-setup-failed");
    });

    it("trusts an attached DWH over a stale cached setup failure", () => {
      // Setup can time out locally yet finish in the background; once the DWH is
      // present, the failure gate must yield to the normal status path.
      expect(state({ hasSetupFailed: true, hasAttachedDwh: true })).toBe(
        "not-connected",
      );
    });

    it("offers storage to an admin who has none", () => {
      expect(state({ hasAttachedDwh: false })).toBe("needs-storage");
    });

    it("tells an entitled admin to refresh instead of re-offering storage", () => {
      // The token says storage is theirs, but the database has not landed yet.
      expect(
        state({ hasAttachedDwh: false, hasStorageTokenFeature: true }),
      ).toBe("storage-not-provisioned");
    });

    it("does not wait on the add-on for an entitled admin without a DWH", () => {
      // Ownership is already known from the token, so there is nothing to buy.
      expect(
        state({
          hasAttachedDwh: false,
          hasStorageTokenFeature: true,
          isLoadingStorageAddOn: true,
        }),
      ).toBe("storage-not-provisioned");
    });

    it("waits for the add-on before offering storage", () => {
      // Until it lands the CTA can't tell purchase modal from store link.
      expect(
        state({ hasAttachedDwh: false, isLoadingStorageAddOn: true }),
      ).toBe("loading");
    });

    it("does not wait on the add-on once storage is there", () => {
      // The add-ons query is skipped for anyone who cannot buy storage.
      expect(state({ isLoadingStorageAddOn: true })).toBe("not-connected");
    });

    it("falls back to the generic error when Sheets is unavailable for some other reason", () => {
      expect(state({ showGdrive: false })).toBe("unavailable");
    });

    it("prefers the connection details over anything the status would show", () => {
      expect(state({ areConnectionDetailsShown: true, status: "active" })).toBe(
        "connection-details",
      );
    });

    it("does not show connection details to an admin without storage", () => {
      expect(
        state({ areConnectionDetailsShown: true, hasAttachedDwh: false }),
      ).toBe("needs-storage");
    });
  });

  describe("connection status, once every gate is passed", () => {
    it.each([
      { status: "active", expected: "connected" },
      // Syncing is still a working connection, so it shares the connected view.
      { status: "syncing", expected: "connected" },
      { status: "paused", expected: "storage-full" },
      { status: "not-connected", expected: "not-connected" },
      { status: "initializing", expected: "connecting" },
      { status: "error", expected: "connection-error" },
    ] as const)("maps $status to $expected", ({ status, expected }) => {
      expect(state({ status })).toBe(expected);
    });
  });
});
