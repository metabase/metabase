import { act } from "@testing-library/react";

import { renderHookWithProviders } from "__support__/ui";

import { useMoveXrayDashboardToSharedCollection } from "./use-xray-dashboards";

const mockUpdateDashboard = jest.fn();

jest.mock("metabase/api", () => ({
  ...jest.requireActual("metabase/api"),
  useUpdateDashboardMutation: () => [mockUpdateDashboard],
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

  it("should set isMoving while moving", async () => {
    let resolveMove: () => void;
    const movePromise = new Promise<void>((resolve) => {
      resolveMove = resolve;
    });

    mockUpdateDashboard.mockReturnValue({
      unwrap: () => movePromise,
    });

    const { result } = renderHookWithProviders(
      () => useMoveXrayDashboardToSharedCollection(),
      {},
    );

    expect(result.current.isMoving).toBe(false);

    let moveFinished: Promise<void>;
    act(() => {
      moveFinished = result.current.moveDashboard(100, 42);
    });

    expect(result.current.isMoving).toBe(true);

    await act(async () => {
      resolveMove!();
      await moveFinished!;
    });

    expect(result.current.isMoving).toBe(false);
  });
});
