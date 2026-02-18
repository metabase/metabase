import {
  setupBillingEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useTransformsBilling } from "./useTransformsBilling";

const BASIC_PRICE = 101;
const ADVANCED_PRICE = 251;

type SetupOpts = {
  isHosted?: boolean;
  hasBasicTransforms?: boolean;
  hasPythonTransforms?: boolean;
  hasBasicTransformsAddOn?: boolean;
  hasAdvancedTransformsAddOn?: boolean;
  previousAddOns?: Array<{
    product_type: string;
    self_service: boolean;
  }>;
};

function setup({
  isHosted = true,
  hasBasicTransforms = false,
  hasPythonTransforms = false,
  hasBasicTransformsAddOn = true,
  hasAdvancedTransformsAddOn = true,
  previousAddOns = [],
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "is-hosted?": isHosted,
    "token-features": createMockTokenFeatures({
      transforms: hasBasicTransforms,
      "transforms-python": hasPythonTransforms,
    }),
  });

  const storeInitialState = createMockState({
    settings: mockSettings({
      "is-hosted?": isHosted,
      "token-features": createMockTokenFeatures({
        transforms: hasBasicTransforms,
        "transforms-python": hasPythonTransforms,
      }),
    }),
  });

  setupPropertiesEndpoints(settings);
  setupBillingEndpoints({
    hasBasicTransformsAddOn,
    hasAdvancedTransformsAddOn,
    transformsBasicPrice: BASIC_PRICE,
    transformsAdvancedPrice: ADVANCED_PRICE,
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
        "transforms-basic",
      );
      expect(result.current.advancedTransformsAddOn).toBeDefined();
      expect(result.current.advancedTransformsAddOn?.product_type).toBe(
        "transforms-advanced",
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

  describe("token features", () => {
    it("should return hasBasicTransforms=false when no transforms feature", async () => {
      const { result } = setup({
        hasBasicTransforms: false,
        hasPythonTransforms: false,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasBasicTransforms).toBe(false);
    });

    it("should return hasBasicTransforms=true when transforms is enabled but not python", async () => {
      const { result } = setup({
        hasBasicTransforms: true,
        hasPythonTransforms: false,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasBasicTransforms).toBe(true);
    });

    it("should return hasBasicTransforms=false when both transforms and python are enabled", async () => {
      const { result } = setup({
        hasBasicTransforms: true,
        hasPythonTransforms: true,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasBasicTransforms).toBe(false);
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
        previousAddOns: [{ product_type: "transforms", self_service: true }],
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hadTransforms).toBe(true);
    });

    it("should return hadTransforms=false when previous transforms add-on is not self-service", async () => {
      const { result } = setup({
        previousAddOns: [{ product_type: "transforms", self_service: false }],
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
      expect(result.current.basicTransformsAddOn?.default_base_fee).toBe(
        BASIC_PRICE,
      );
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
      expect(result.current.advancedTransformsAddOn?.default_base_fee).toBe(
        ADVANCED_PRICE,
      );
    });
  });
});
