import { trackSchemaEvent } from "metabase/lib/analytics";
import type { MoveToTrashEvent } from "metabase-types/analytics";

export const archiveAndTrack = async ({
  archive,
  model,
  modelId,
  triggeredFrom,
}: {
  archive: () => Promise<void>;
  model: MoveToTrashEvent["event_detail"] | "card";
  modelId: number;
  triggeredFrom: MoveToTrashEvent["triggered_from"];
}): Promise<void> => {
  const start = new Date().getTime();
  const logAnalytics = (successful: boolean) =>
    trackSchemaEvent("simple_event", {
      event: "moved-to-trash",
      event_detail: model === "card" ? "question" : model,
      target_id: modelId,
      triggered_from: triggeredFrom,
      duration_ms: new Date().getTime() - start,
      result: successful ? "success" : "failure",
    });

  return archive()
    .then(result => {
      logAnalytics(true);
      return result;
    })
    .catch(error => {
      logAnalytics(false);
      throw error;
    });
};
