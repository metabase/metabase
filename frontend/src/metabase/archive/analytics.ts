import { trackSchemaEvent } from "metabase/utils/analytics";

type MoveToTrashEventDetail =
  | "question"
  | "model"
  | "metric"
  | "dashboard"
  | "collection"
  | "dataset"
  | "indexed-entity"
  | "snippet"
  | "document"
  | "table"
  | "transform";

type MoveToTrashTriggeredFrom = "collection" | "detail_page" | "cleanup_modal";

export const archiveAndTrack = async ({
  archive,
  model,
  modelId,
  triggeredFrom,
}: {
  archive: () => Promise<void>;
  model: MoveToTrashEventDetail | "card";
  modelId: number;
  triggeredFrom: MoveToTrashTriggeredFrom;
}): Promise<void> => {
  const start = new Date().getTime();
  const logAnalytics = (successful: boolean) => {
    let eventDetail: MoveToTrashEventDetail;
    if (model === "card") {
      eventDetail = "question";
    } else {
      eventDetail = model;
    }

    return trackSchemaEvent("simple_event", {
      event: "moved-to-trash",
      event_detail: eventDetail,
      target_id: modelId,
      triggered_from: triggeredFrom,
      duration_ms: new Date().getTime() - start,
      result: successful ? "success" : "failure",
    });
  };

  return archive()
    .then((result) => {
      logAnalytics(true);
      return result;
    })
    .catch((error) => {
      logAnalytics(false);
      throw error;
    });
};
