import { trackSimpleEvent } from "metabase/analytics";
import type { TransformTestId } from "metabase-types/api";

export type TransformTestRunTriggeredFrom =
  | "test_list"
  | "test_overview"
  | "test_runs";

export function trackTransformTestTriggerManualRun({
  testId,
  triggeredFrom,
}: {
  testId: TransformTestId;
  triggeredFrom: TransformTestRunTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "transform_test_trigger_manual_run",
    target_id: testId,
    triggered_from: triggeredFrom,
  });
}
