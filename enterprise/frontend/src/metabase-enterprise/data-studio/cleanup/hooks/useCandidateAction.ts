import { useCallback } from "react";

import { trackDataStudioCleanupCandidateAction } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { UsageMetadataCandidateSummary } from "metabase-types/api";

import { isStaleCandidateError } from "../utils";

type CandidateAction = "create" | "dismiss" | "restore";

type CandidateIdentity = Pick<
  UsageMetadataCandidateSummary,
  "id" | "candidate_type"
>;

type CandidateActionOptions<Result> = {
  action: CandidateAction;
  candidate: CandidateIdentity;
  request: () => Promise<Result>;
  errorMessage: string;
  onStale: () => void;
  onSuccess?: (result: Result) => void | Promise<void>;
};

export function useCandidateAction() {
  const { sendErrorToast } = useMetadataToasts();

  return useCallback(
    async <Result>({
      action,
      candidate,
      request,
      errorMessage,
      onStale,
      onSuccess,
    }: CandidateActionOptions<Result>) => {
      let result: Result;
      try {
        result = await request();
      } catch (error) {
        trackCandidateAction(action, candidate, "failure");
        if (isStaleCandidateError(error)) {
          onStale();
        } else {
          sendErrorToast(errorMessage);
        }
        return;
      }

      trackCandidateAction(action, candidate, "success");
      await onSuccess?.(result);
      return result;
    },
    [sendErrorToast],
  );
}

function trackCandidateAction(
  action: CandidateAction,
  candidate: CandidateIdentity,
  result: "success" | "failure",
) {
  trackDataStudioCleanupCandidateAction({
    action,
    candidateId: candidate.id,
    candidateType: candidate.candidate_type,
    result,
  });
}
