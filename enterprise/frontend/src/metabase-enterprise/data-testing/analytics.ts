import { trackSimpleEvent } from "metabase/analytics";
import type {
  CardTestId,
  SegmentTestId,
  TransformTestId,
} from "metabase-types/api";

export type DataTestRunTriggeredFrom =
  | "test_list"
  | "test_overview"
  | "test_runs";

export function trackTransformTestTriggerManualRun({
  testId,
  triggeredFrom,
}: {
  testId: TransformTestId;
  triggeredFrom: DataTestRunTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "transform_test_trigger_manual_run",
    target_id: testId,
    triggered_from: triggeredFrom,
  });
}

export function trackCardTestTriggerManualRun({
  testId,
  triggeredFrom,
}: {
  testId: CardTestId;
  triggeredFrom: DataTestRunTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "card_test_trigger_manual_run",
    target_id: testId,
    triggered_from: triggeredFrom,
  });
}

export function trackSegmentTestTriggerManualRun({
  testId,
  triggeredFrom,
}: {
  testId: SegmentTestId;
  triggeredFrom: DataTestRunTriggeredFrom;
}) {
  trackSimpleEvent({
    event: "segment_test_trigger_manual_run",
    target_id: testId,
    triggered_from: triggeredFrom,
  });
}
