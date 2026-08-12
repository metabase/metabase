import { renderHook } from "@testing-library/react";

import { useMetadataToasts } from "metabase/metadata/hooks";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import { useCandidateAction } from "./useCandidateAction";

jest.mock("metabase/metadata/hooks", () => ({
  useMetadataToasts: jest.fn(),
}));

jest.mock("metabase/common/data-studio/analytics", () => ({
  trackDataStudioCleanupCandidateAction: jest.fn(),
}));

// jest.mock above replaces the module export with a jest.fn at runtime
const useMetadataToastsMock = useMetadataToasts as unknown as jest.Mock;

const candidate: Pick<UsageMetadataCandidateSummary, "id" | "candidate_type"> =
  {
    id: 1,
    candidate_type: "segment",
  };

function setup() {
  const sendErrorToast = jest.fn();
  useMetadataToastsMock.mockReturnValue({ sendErrorToast });

  const { result } = renderHook(() => useCandidateAction());

  return { runCandidateAction: result.current, sendErrorToast };
}

function requestFailingWith(status: number) {
  return () => Promise.reject({ status });
}

describe("useCandidateAction", () => {
  it.each([409, 404])(
    "calls onStale instead of showing a toast when the request fails with %d",
    async (status) => {
      const { runCandidateAction, sendErrorToast } = setup();
      const onStale = jest.fn();

      await runCandidateAction({
        action: "create",
        candidate,
        request: requestFailingWith(status),
        errorMessage: "Could not create candidate",
        onStale,
      });

      expect(onStale).toHaveBeenCalledTimes(1);
      expect(sendErrorToast).not.toHaveBeenCalled();
    },
  );

  it("shows an error toast for any other failure status", async () => {
    const { runCandidateAction, sendErrorToast } = setup();
    const onStale = jest.fn();

    await runCandidateAction({
      action: "create",
      candidate,
      request: requestFailingWith(500),
      errorMessage: "Could not create candidate",
      onStale,
    });

    expect(onStale).not.toHaveBeenCalled();
    expect(sendErrorToast).toHaveBeenCalledWith("Could not create candidate");
  });

  it("calls onSuccess and returns the result on success", async () => {
    const { runCandidateAction } = setup();
    const onStale = jest.fn();
    const onSuccess = jest.fn();
    const success = { id: 42 };

    const result = await runCandidateAction({
      action: "create",
      candidate,
      request: () => Promise.resolve(success),
      errorMessage: "Could not create candidate",
      onStale,
      onSuccess,
    });

    expect(result).toEqual(success);
    expect(onSuccess).toHaveBeenCalledWith(success);
    expect(onStale).not.toHaveBeenCalled();
  });
});
