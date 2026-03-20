import { act } from "@testing-library/react";

import { renderHookWithProviders } from "__support__/ui";

import { useMoveXrayDashboardToSharedCollection } from "./use-xray-dashboards";

const mockUpdateDashboard = jest.fn();

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useUpdateDashboardMutation: () => [mockUpdateDashboard, { isLoading: false }],
}));

describe("useMoveXrayDashboardToSharedCollection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should move a single dashboard to the target collection", async () => {
    mockUpdateDashboard.mockReturnValue({
      unwrap: () => Promise.resolve({}),
    });

    const { result } = renderHookWithProviders(
      () => useMoveXrayDashboardToSharedCollection(),
      {},
    );

    await act(() => result.current.moveDashboard(100, 42));

    expect(mockUpdateDashboard).toHaveBeenCalledTimes(1);
    expect(mockUpdateDashboard).toHaveBeenCalledWith({
      id: 100,
      collection_id: 42,
    });
  });

  it("should expose isMoving from the mutation", () => {
    const { result } = renderHookWithProviders(
      () => useMoveXrayDashboardToSharedCollection(),
      {},
    );

    // isMoving is forwarded from RTK Query's isLoading
    expect(result.current.isMoving).toBe(false);
  });
});
