import { trackSimpleEvent } from "metabase/analytics";
import type { DataTestId, DataTestType } from "metabase-types/api";

export type DataTestRunTriggeredFrom =
  | "test_list"
  | "test_overview"
  | "test_runs";

export function trackDataTestTriggerManualRun({
  testType,
  testId,
  triggeredFrom,
}: {
  testType: DataTestType;
  testId: DataTestId;
  triggeredFrom: DataTestRunTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "data_test_trigger_manual_run",
    event_detail: testType,
    target_id: testId,
    triggered_from: triggeredFrom,
  });
}
