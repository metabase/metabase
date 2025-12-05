import { renderHook } from "@testing-library/react";

import { useAvailableParameters } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-available-parameters";
import type { Card, Dashboard } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockParameter,
} from "metabase-types/api/mocks";

const mockDispatch = jest.fn();

jest.mock("metabase/lib/redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: jest.fn(),
}));

jest.mock("metabase/parameters/utils/dashboards", () => ({
  getSavedDashboardUiParameters: jest.fn(),
}));

jest.mock("metabase-lib/v1/parameters/utils/cards", () => ({
  getCardUiParameters: jest.fn(),
}));

jest.mock("metabase/redux/metadata", () => ({
  addFields: jest.fn((fields) => ({ type: "ADD_FIELDS", payload: fields })),
}));

jest.mock("metabase/selectors/metadata", () => ({
  getMetadata: jest.fn(),
}));

const mockUseSelector = jest.requireMock("metabase/lib/redux").useSelector;
const mockGetSavedDashboardUiParameters = jest.requireMock(
  "metabase/parameters/utils/dashboards",
).getSavedDashboardUiParameters;
const mockGetCardUiParameters = jest.requireMock(
  "metabase-lib/v1/parameters/utils/cards",
).getCardUiParameters;

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
  parameters: [mockParameter1, mockParameter2],
});

const mockCard = createMockCard({
  id: 1,
  name: "Test Question",
});

describe("useAvailableParameters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSelector.mockReturnValue({});
    mockGetSavedDashboardUiParameters.mockReturnValue([
      mockParameter1,
      mockParameter2,
    ]);
    mockGetCardUiParameters.mockReturnValue([mockParameter1]);
  });

  describe("with null resource", () => {
    it("should return empty arrays when resource is null", () => {
      const { result } = renderHook(() =>
        useAvailableParameters({
          experience: "dashboard",
          resource: null,
        }),
      );

      expect(result.current.availableParameters).toEqual([]);
      expect(result.current.initialAvailableParameters).toBeNull();
    });
  });

  describe("with dashboard experience", () => {
    it("should return expected parameters", () => {
      const { result } = renderHook(() =>
        useAvailableParameters({
          experience: "dashboard",
          resource: mockDashboard,
        }),
      );

      expect(result.current.availableParameters).toEqual([
        mockParameter1,
        mockParameter2,
      ]);
    });

    it("should set initialAvailableParameters on first resource load", () => {
      const { result } = renderHook(() =>
        useAvailableParameters({
          experience: "dashboard",
          resource: mockDashboard,
        }),
      );

      expect(result.current.initialAvailableParameters).toEqual([
        mockParameter1,
        mockParameter2,
      ]);
    });
  });

  describe("with chart experience", () => {
    it("should return expected parameters", () => {
      const { result } = renderHook(() =>
        useAvailableParameters({
          experience: "chart",
          resource: mockCard,
        }),
      );

      expect(result.current.availableParameters).toEqual([mockParameter1]);
    });

    it("should handle null return from getCardUiParameters", () => {
      mockGetCardUiParameters.mockReturnValue(null);

      const { result } = renderHook(() =>
        useAvailableParameters({
          experience: "chart",
          resource: mockCard,
        }),
      );

      expect(result.current.availableParameters).toEqual([]);
    });
  });

  describe("resource change handling", () => {
    it("should reinitialize initialAvailableParameters when resource id changes", () => {
      const firstDashboard = createMockDashboard({
        id: 1,
        name: "Dashboard 1",
      });
      const secondDashboard = createMockDashboard({
        id: 2,
        name: "Dashboard 2",
      });

      const firstParameters = [mockParameter1];
      const secondParameters = [mockParameter2];

      mockGetSavedDashboardUiParameters
        .mockReturnValueOnce(firstParameters)
        .mockReturnValueOnce(secondParameters);

      const { result, rerender } = renderHook(
        ({ resource }: { resource: Dashboard | Card | null }) =>
          useAvailableParameters({
            experience: "dashboard",
            resource,
          }),
        {
          initialProps: { resource: firstDashboard as Dashboard | Card | null },
        },
      );

      expect(result.current.initialAvailableParameters).toEqual(
        firstParameters,
      );

      rerender({ resource: secondDashboard });

      expect(result.current.initialAvailableParameters).toEqual(
        secondParameters,
      );
    });

    it("should not change initialAvailableParameters when resource id stays the same", () => {
      const dashboard = createMockDashboard({ id: 1, name: "Dashboard 1" });

      const firstParameters = [mockParameter1];
      const updatedParameters = [mockParameter1, mockParameter2];

      mockGetSavedDashboardUiParameters
        .mockReturnValueOnce(firstParameters)
        .mockReturnValueOnce(updatedParameters);

      const { result, rerender } = renderHook(
        ({ resource }: { resource: Dashboard | Card | null }) =>
          useAvailableParameters({
            experience: "dashboard",
            resource,
          }),
        {
          initialProps: { resource: dashboard as Dashboard | Card | null },
        },
      );

      expect(result.current.initialAvailableParameters).toEqual(
        firstParameters,
      );

      // Rerender with same resource (simulating metadata update)
      rerender({ resource: { ...dashboard } as Dashboard | Card | null });

      // initialAvailableParameters should remain unchanged
      expect(result.current.initialAvailableParameters).toEqual(
        firstParameters,
      );
      // But availableParameters should update
      expect(result.current.availableParameters).toEqual(updatedParameters);
    });

    it("should reset initialAvailableParameters when switching from dashboard to card", () => {
      const dashboard = createMockDashboard({ id: 1 });
      const card = createMockCard({ id: 2 });

      const dashboardParameters = [mockParameter1, mockParameter2];
      const cardParameters = [mockParameter1];

      mockGetSavedDashboardUiParameters.mockReturnValue(dashboardParameters);
      mockGetCardUiParameters.mockReturnValue(cardParameters);

      const { result, rerender } = renderHook(
        ({
          experience,
          resource,
        }: {
          experience: "dashboard" | "chart";
          resource: Dashboard | Card | null;
        }) =>
          useAvailableParameters({
            experience,
            resource,
          }),
        {
          initialProps: {
            experience: "dashboard" as "dashboard" | "chart",
            resource: dashboard as Dashboard | Card | null,
          },
        },
      );

      expect(result.current.initialAvailableParameters).toEqual(
        dashboardParameters,
      );

      rerender({
        experience: "chart",
        resource: card,
      });

      expect(result.current.initialAvailableParameters).toEqual(cardParameters);
    });

    it("should handle transition from null to resource", () => {
      const { result, rerender } = renderHook(
        ({ resource }: { resource: Dashboard | Card | null }) =>
          useAvailableParameters({
            experience: "dashboard",
            resource,
          }),
        {
          initialProps: { resource: null as Dashboard | Card | null },
        },
      );

      expect(result.current.initialAvailableParameters).toBeNull();

      rerender({ resource: mockDashboard });

      expect(result.current.initialAvailableParameters).toEqual([
        mockParameter1,
        mockParameter2,
      ]);
    });

    it("should handle transition from resource to null", () => {
      const { result, rerender } = renderHook(
        ({ resource }: { resource: Dashboard | Card | null }) =>
          useAvailableParameters({
            experience: "dashboard",
            resource,
          }),
        {
          initialProps: { resource: mockDashboard as Dashboard | Card | null },
        },
      );

      expect(result.current.initialAvailableParameters).toEqual([
        mockParameter1,
        mockParameter2,
      ]);

      rerender({ resource: null });

      // initialAvailableParameters should be reset to null when resource becomes null
      expect(result.current.initialAvailableParameters).toBeNull();
    });
  });

  describe("param_fields handling", () => {
    it("should dispatch addFields when resource has param_fields", () => {
      const dashboardWithParamFields = {
        ...mockDashboard,
        param_fields: {
          field1: [{ id: 1, name: "Field 1" }],
          field2: [{ id: 2, name: "Field 2" }],
        },
      };

      renderHook(() =>
        useAvailableParameters({
          experience: "dashboard",
          resource: dashboardWithParamFields as unknown as Dashboard,
        }),
      );

      expect(mockDispatch).toHaveBeenCalled();
    });
  });
});
