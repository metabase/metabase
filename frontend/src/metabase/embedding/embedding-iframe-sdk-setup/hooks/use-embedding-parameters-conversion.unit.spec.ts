import { renderHook } from "@testing-library/react";

import { useEmbeddingParametersConversion } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters-conversion";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Parameter } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

describe("useEmbeddingParametersConversion", () => {
  const mockParameter1 = createMockParameter({
    id: "param1",
    slug: "category",
    name: "Category",
  });

  const mockParameter2 = createMockParameter({
    id: "param2",
    slug: "status",
    name: "Status",
  });

  const mockParameter3 = createMockParameter({
    id: "param3",
    slug: "region",
    name: "Region",
  });

  describe("convertToEmbedSettings", () => {
    it("should convert enabled parameters correctly", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {
        category: "enabled",
        status: "enabled",
      };

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: [],
        lockedParameters: [],
      });
    });

    it("should convert disabled parameters to hiddenParameters", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {
        category: "disabled",
        status: "enabled",
      };

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: ["category"],
        lockedParameters: [],
      });
    });

    it("should convert locked parameters to lockedParameters", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {
        category: "locked",
        status: "enabled",
      };

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: [],
        lockedParameters: ["category"],
      });
    });

    it("should handle mixed parameter states", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {
        category: "locked",
        status: "disabled",
        region: "enabled",
      };

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: ["status"],
        lockedParameters: ["category"],
      });
    });

    it("should handle empty embedding parameters", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {};

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: [],
        lockedParameters: [],
      });
    });

    it("should handle parameters with special characters", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams: EmbeddingParameters = {
        "param-with-dash": "disabled",
        param_with_underscore: "locked",
      };

      const sdkSettings =
        result.current.convertToEmbedSettings(embeddingParams);

      expect(sdkSettings).toEqual({
        hiddenParameters: ["param-with-dash"],
        lockedParameters: ["param_with_underscore"],
      });
    });
  });

  describe("convertToEmbeddingParameters", () => {
    it("should convert parameters with no hidden or locked to enabled", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [mockParameter1, mockParameter2];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        [],
        [],
      );

      expect(embeddingParams).toEqual({
        category: "enabled",
        status: "enabled",
      });
    });

    it("should convert hidden parameters to disabled", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [mockParameter1, mockParameter2];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        ["category"],
        [],
      );

      expect(embeddingParams).toEqual({
        category: "disabled",
        status: "enabled",
      });
    });

    it("should convert locked parameters to locked", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [mockParameter1, mockParameter2];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        [],
        ["category"],
      );

      expect(embeddingParams).toEqual({
        category: "locked",
        status: "enabled",
      });
    });

    it("should prioritize locked over hidden", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [mockParameter1];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        ["category"],
        ["category"],
      );

      expect(embeddingParams).toEqual({
        category: "locked",
      });
    });

    it("should handle mixed parameter states", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [
        mockParameter1,
        mockParameter2,
        mockParameter3,
      ];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        ["status"],
        ["category"],
      );

      expect(embeddingParams).toEqual({
        category: "locked",
        status: "disabled",
        region: "enabled",
      });
    });

    it("should handle empty parameters list", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const embeddingParams = result.current.convertToEmbeddingParameters(
        [],
        [],
        [],
      );

      expect(embeddingParams).toEqual({});
    });

    it("should handle undefined hidden and locked parameters", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const parameters: Parameter[] = [mockParameter1, mockParameter2];

      const embeddingParams = result.current.convertToEmbeddingParameters(
        parameters,
        undefined,
        undefined,
      );

      expect(embeddingParams).toEqual({
        category: "enabled",
        status: "enabled",
      });
    });
  });

  describe("round-trip conversion", () => {
    it("should correctly convert back and forth", () => {
      const { result } = renderHook(() => useEmbeddingParametersConversion());

      const originalEmbeddingParams: EmbeddingParameters = {
        category: "locked",
        status: "disabled",
        region: "enabled",
      };

      const sdkSettings = result.current.convertToEmbedSettings(
        originalEmbeddingParams,
      );

      const parameters: Parameter[] = [
        mockParameter1,
        mockParameter2,
        mockParameter3,
      ];

      const hiddenParams =
        "hiddenParameters" in sdkSettings
          ? sdkSettings.hiddenParameters
          : undefined;
      const lockedParams =
        "lockedParameters" in sdkSettings
          ? sdkSettings.lockedParameters
          : undefined;

      const convertedBack = result.current.convertToEmbeddingParameters(
        parameters,
        hiddenParams,
        lockedParams,
      );

      expect(convertedBack).toEqual(originalEmbeddingParams);
    });
  });
});
