import {
  setupBillingEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import type { AddOnProductType } from "metabase-types/api/store";

import { useTransformsBilling } from "./useTransformsBilling";

type SetupOpts = {
  isHosted?: boolean;
  hasBasicTransformsAddOn?: boolean;
  hasAdvancedTransformsAddOn?: boolean;
  previousAddOns?: Array<{
    product_type: AddOnProductType;
    self_service: boolean;
  }>;
};

function setup({
  isHosted = true,
  hasBasicTransformsAddOn = true,
  hasAdvancedTransformsAddOn = true,
  previousAddOns = [],
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "is-hosted?": isHosted,
  });

  const storeInitialState = createMockState({
    settings: mockSettings({
      "is-hosted?": isHosted,
    }),
    currentUser: createMockUser({ is_superuser: true }),
  });

  setupPropertiesEndpoints(settings);
  setupBillingEndpoints({
    hasBasicTransformsAddOn,
    hasAdvancedTransformsAddOn,
    previousAddOns,
  });

  return renderHookWithProviders(() => useTransformsBilling(), {
    storeInitialState,
  });
}

describe("useTransformsBilling", () => {
  describe("isHosted behavior", () => {
    it("should fetch add-ons when isHosted is true", async () => {
      const { result } = setup({ isHosted: true });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.basicTransformsAddOn).toBeDefined();
      expect(result.current.basicTransformsAddOn?.product_type).toBe(
        "transforms-basic-metered",
      );
      expect(result.current.advancedTransformsAddOn).toBeDefined();
      expect(result.current.advancedTransformsAddOn?.product_type).toBe(
        "transforms-advanced-metered",
      );
    });

    it("should skip fetching add-ons when isHosted is false", async () => {
      const { result } = setup({ isHosted: false });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.basicTransformsAddOn).toBeUndefined();
      expect(result.current.advancedTransformsAddOn).toBeUndefined();
    });
  });

  describe("hadTransforms", () => {
    it("should return hadTransforms=false when there are no previous add-ons", async () => {
      const { result } = setup({ previousAddOns: [] });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hadTransforms).toBe(false);
    });

    it("should return hadTransforms=true when previous add-ons include a self-service transforms product", async () => {
      const { result } = setup({
        previousAddOns: [
          { product_type: "transforms-basic-metered", self_service: true },
        ],
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hadTransforms).toBe(true);
    });

    it("should return hadTransforms=false when previous transforms add-on is not self-service", async () => {
      const { result } = setup({
        previousAddOns: [
          { product_type: "transforms-basic-metered", self_service: false },
        ],
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hadTransforms).toBe(false);
    });

    it("should return hadTransforms=false when previous add-ons are unrelated", async () => {
      const { result } = setup({
        previousAddOns: [{ product_type: "metabase-ai", self_service: true }],
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hadTransforms).toBe(false);
    });
  });

  describe("add-on matching", () => {
    it("should not return add-ons when none are available", async () => {
      const { result } = setup({
        isHosted: true,
        hasBasicTransformsAddOn: false,
        hasAdvancedTransformsAddOn: false,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.basicTransformsAddOn).toBeUndefined();
      expect(result.current.advancedTransformsAddOn).toBeUndefined();
    });

    it("should return only basic add-on when advanced is not available", async () => {
      const { result } = setup({
        isHosted: true,
        hasBasicTransformsAddOn: true,
        hasAdvancedTransformsAddOn: false,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.basicTransformsAddOn).toBeDefined();
      expect(result.current.advancedTransformsAddOn).toBeUndefined();
    });

    it("should return only advanced add-on when basic is not available", async () => {
      const { result } = setup({
        isHosted: true,
        hasBasicTransformsAddOn: false,
        hasAdvancedTransformsAddOn: true,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.basicTransformsAddOn).toBeUndefined();
      expect(result.current.advancedTransformsAddOn).toBeDefined();
    });
  });
});
