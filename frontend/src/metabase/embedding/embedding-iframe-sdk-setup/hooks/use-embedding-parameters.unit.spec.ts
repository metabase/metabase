import { renderHook } from "@testing-library/react";

import { useEmbeddingParameters } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters";
import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Card, Dashboard, Parameter } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockParameter,
} from "metabase-types/api/mocks";

jest.mock(
  "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters-conversion",
);
jest.mock(
  "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params",
);

const mockUseEmbeddingParametersConversion = jest.requireMock(
  "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-embedding-parameters-conversion",
).useEmbeddingParametersConversion;

const mockGetDefaultEmbeddingParams = jest.requireMock(
  "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-default-embedding-params",
).getDefaultEmbeddingParams;

const mockUpdateSettings = jest.fn();
const mockConvertToEmbedSettings = jest.fn();
const mockConvertToEmbeddingParameters = jest.fn();

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

const mockDashboard = createMockDashboard({
  id: 1,
  name: "Test Dashboard",
});

const mockCard = createMockCard({
  id: 1,
  name: "Test Question",
});

const defaultSettings: any = {
  dashboardId: 1,
  hiddenParameters: ["category"],
  lockedParameters: ["status"],
  isGuest: true,
} as SdkIframeEmbedSetupSettings;

describe("useEmbeddingParameters", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseEmbeddingParametersConversion.mockReturnValue({
      convertToEmbedSettings: mockConvertToEmbedSettings,
      convertToEmbeddingParameters: mockConvertToEmbeddingParameters,
    });

    mockConvertToEmbeddingParameters.mockImplementation(
      (
        parameters: Parameter[],
        hiddenParameters: string[] = [],
        lockedParameters: string[] = [],
      ) => {
        return parameters.reduce<EmbeddingParameters>((acc, { slug }) => {
          if (lockedParameters.includes(slug)) {
            acc[slug] = "locked";
          } else if (hiddenParameters.includes(slug)) {
            acc[slug] = "disabled";
          } else {
            acc[slug] = "enabled";
          }
          return acc;
        }, {});
      },
    );

    mockConvertToEmbedSettings.mockImplementation(
      (params: EmbeddingParameters) => ({
        hiddenParameters: Object.keys(params).filter(
          (key) => params[key] === "disabled",
        ),
        lockedParameters: Object.keys(params).filter(
          (key) => params[key] === "locked",
        ),
      }),
    );

    mockGetDefaultEmbeddingParams.mockReturnValue({
      category: "enabled",
      status: "enabled",
    });
  });

  describe("areEmbeddingParametersInitialized", () => {
    it("should return true when dashboardId and hiddenParameters are present", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.areEmbeddingParametersInitialized).toBe(true);
    });

    it("should return true when dashboardId and lockedParameters are present", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            dashboardId: 1,
            lockedParameters: ["status"],
            isGuest: true,
          } as SdkIframeEmbedSetupSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.areEmbeddingParametersInitialized).toBe(true);
    });

    it("should return false when no resource id is present", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            hiddenParameters: ["category"],
            isGuest: true,
          } as SdkIframeEmbedSetupSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.areEmbeddingParametersInitialized).toBe(false);
    });

    it("should return false when no parameters are initialized", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            dashboardId: 1,
            isGuest: true,
          } as SdkIframeEmbedSetupSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.areEmbeddingParametersInitialized).toBe(false);
    });

    it("should work with questionId instead of dashboardId", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            questionId: 1,
            lockedParameters: ["status"],
            isGuest: true,
          } as SdkIframeEmbedSetupSettings,
          updateSettings: mockUpdateSettings,
          resource: mockCard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.areEmbeddingParametersInitialized).toBe(true);
    });
  });

  describe("initialEmbeddingParameters", () => {
    it("should return null when resource is null", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: null,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.initialEmbeddingParameters).toBeNull();
    });

    it("should return null when initialAvailableParameters is null", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: null,
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.initialEmbeddingParameters).toBeNull();
    });
  });

  describe("embeddingParameters", () => {
    it("should build embedding parameters from settings correctly", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(result.current.embeddingParameters).toEqual({
        category: "disabled",
        status: "locked",
      });
    });

    it("should mark parameter as enabled when not hidden or locked", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            dashboardId: 1,
            hiddenParameters: [],
            lockedParameters: [],
            isGuest: true,
          } as any,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1],
          availableParameters: [mockParameter1],
        }),
      );

      expect(result.current.embeddingParameters).toEqual({
        category: "enabled",
      });
    });

    it("should prioritize locked over hidden", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            dashboardId: 1,
            hiddenParameters: ["category"],
            lockedParameters: ["category"],
            isGuest: true,
          } as any,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1],
          availableParameters: [mockParameter1],
        }),
      );

      expect(result.current.embeddingParameters).toEqual({
        category: "locked",
      });
    });

    it("should handle empty parameters list", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [],
          availableParameters: [],
        }),
      );

      expect(result.current.embeddingParameters).toEqual({});
    });
  });

  describe("onEmbeddingParametersChange", () => {
    it("should call updateSettings with correct values", () => {
      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [mockParameter1, mockParameter2],
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      const newParams: EmbeddingParameters = {
        category: "locked",
        status: "enabled",
      };

      result.current.onEmbeddingParametersChange(newParams);

      expect(mockConvertToEmbedSettings).toHaveBeenCalledWith(newParams);
      expect(mockUpdateSettings).toHaveBeenCalled();
    });
  });

  describe("initialization with initial parameters", () => {
    it("should call onEmbeddingParametersChange once when initialEmbeddingParameters changes from null to value for guest embeds", () => {
      const mockInitialParams = { category: "enabled", status: "enabled" };
      mockGetDefaultEmbeddingParams.mockReturnValue(mockInitialParams);

      const { rerender } = renderHook(
        ({
          resource,
          initialAvailableParameters,
        }: {
          resource: Dashboard | Card | null;
          initialAvailableParameters: Parameter[] | null;
        }) =>
          useEmbeddingParameters({
            settings: defaultSettings,
            updateSettings: mockUpdateSettings,
            resource,
            initialAvailableParameters,
            availableParameters: [mockParameter1, mockParameter2],
          }),
        {
          initialProps: {
            resource: null,
            initialAvailableParameters: null,
          },
        },
      );

      expect(mockUpdateSettings).not.toHaveBeenCalled();

      rerender({
        resource: mockDashboard as any,
        initialAvailableParameters: [mockParameter1, mockParameter2] as any,
      });

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);

      rerender({
        resource: mockDashboard as any,
        initialAvailableParameters: [mockParameter1, mockParameter2] as any,
      });

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    });

    it("should not call onEmbeddingParametersChange when not a guest embed", () => {
      const mockInitialParams = { category: "enabled", status: "enabled" };
      mockGetDefaultEmbeddingParams.mockReturnValue(mockInitialParams);

      const { rerender } = renderHook(
        ({
          resource,
          initialAvailableParameters,
        }: {
          resource: Dashboard | Card | null;
          initialAvailableParameters: Parameter[] | null;
        }) =>
          useEmbeddingParameters({
            settings: {
              ...defaultSettings,
              isGuest: false,
            },
            updateSettings: mockUpdateSettings,
            resource,
            initialAvailableParameters,
            availableParameters: [mockParameter1, mockParameter2],
          }),
        {
          initialProps: {
            resource: null,
            initialAvailableParameters: null,
          },
        },
      );

      rerender({
        resource: mockDashboard as any,
        initialAvailableParameters: [mockParameter1, mockParameter2] as any,
      });

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it("should not call onEmbeddingParametersChange when initialEmbeddingParameters is null", () => {
      mockGetDefaultEmbeddingParams.mockReturnValue(null);

      renderHook(() =>
        useEmbeddingParameters({
          settings: defaultSettings,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: null,
          availableParameters: [mockParameter1, mockParameter2],
        }),
      );

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });

    it("should handle initialization with Card resource", () => {
      const mockInitialParams = { category: "enabled" };
      mockGetDefaultEmbeddingParams.mockReturnValue(mockInitialParams);

      const { rerender } = renderHook(
        ({
          resource,
          initialAvailableParameters,
        }: {
          resource: Dashboard | Card | null;
          initialAvailableParameters: Parameter[] | null;
        }) =>
          useEmbeddingParameters({
            settings: {
              questionId: 1,
              isGuest: true,
              hiddenParameters: [],
            } as unknown as SdkIframeEmbedSetupSettings,
            updateSettings: mockUpdateSettings,
            resource,
            initialAvailableParameters,
            availableParameters: [mockParameter1],
          }),
        {
          initialProps: {
            resource: null,
            initialAvailableParameters: null,
          },
        },
      );

      rerender({
        resource: mockCard as any,
        initialAvailableParameters: [mockParameter1] as any,
      });

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    });

    it("should only initialize once even when other dependencies change", () => {
      const mockInitialParams = { category: "enabled", status: "enabled" };
      mockGetDefaultEmbeddingParams.mockReturnValue(mockInitialParams);

      const { rerender } = renderHook(
        ({ settings }: { settings: any }) =>
          useEmbeddingParameters({
            settings,
            updateSettings: mockUpdateSettings,
            resource: mockDashboard,
            initialAvailableParameters: [mockParameter1, mockParameter2],
            availableParameters: [mockParameter1, mockParameter2],
          }),
        {
          initialProps: {
            settings: defaultSettings,
          },
        },
      );

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);

      rerender({
        settings: {
          ...defaultSettings,
          hiddenParameters: ["different"],
        },
      });

      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle parameters with special characters in slugs", () => {
      const specialParam = createMockParameter({
        id: "special",
        slug: "param-with-dash_and_underscore",
        name: "Special Param",
      });

      const { result } = renderHook(() =>
        useEmbeddingParameters({
          settings: {
            dashboardId: 1,
            hiddenParameters: ["param-with-dash_and_underscore"],
            lockedParameters: [],
            isGuest: true,
          } as any,
          updateSettings: mockUpdateSettings,
          resource: mockDashboard,
          initialAvailableParameters: [specialParam],
          availableParameters: [specialParam],
        }),
      );

      expect(result.current.embeddingParameters).toEqual({
        "param-with-dash_and_underscore": "disabled",
      });
    });

    it("should handle switching between Dashboard and Card resources", () => {
      const { rerender, result } = renderHook(
        ({ resource }: { resource: Dashboard | Card }) =>
          useEmbeddingParameters({
            settings: defaultSettings,
            updateSettings: mockUpdateSettings,
            resource,
            initialAvailableParameters: [mockParameter1],
            availableParameters: [mockParameter1],
          }),
        {
          initialProps: {
            resource: mockDashboard as Dashboard | Card,
          },
        },
      );

      expect(result.current.initialEmbeddingParameters).toBeTruthy();

      rerender({ resource: mockCard });

      expect(result.current.initialEmbeddingParameters).toBeTruthy();
      expect(mockGetDefaultEmbeddingParams).toHaveBeenCalledWith(mockCard, [
        mockParameter1,
      ]);
    });

    it("should reinitialize embedding parameters when resource id changes for guest embeds", () => {
      const firstDashboard = createMockDashboard({ id: 1 });
      const secondDashboard = createMockDashboard({ id: 2 });

      const mockInitialParams = { category: "enabled" };
      mockGetDefaultEmbeddingParams.mockReturnValue(mockInitialParams);

      const { rerender } = renderHook(
        ({
          resource,
          initialAvailableParameters,
        }: {
          resource: Dashboard | Card | null;
          initialAvailableParameters: Parameter[] | null;
        }) =>
          useEmbeddingParameters({
            settings: defaultSettings,
            updateSettings: mockUpdateSettings,
            resource,
            initialAvailableParameters,
            availableParameters: [mockParameter1],
          }),
        {
          initialProps: {
            resource: firstDashboard as Dashboard | Card | null,
            initialAvailableParameters: [mockParameter1] as Parameter[] | null,
          },
        },
      );

      // First initialization
      expect(mockUpdateSettings).toHaveBeenCalledTimes(1);

      // Change to a different resource
      rerender({
        resource: secondDashboard,
        initialAvailableParameters: [mockParameter1],
      });

      // Should reinitialize for the new resource
      expect(mockUpdateSettings).toHaveBeenCalledTimes(2);
    });
  });
});
