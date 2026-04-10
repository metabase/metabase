import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackDataRecordModified = ({
  event_detail,
  target_id,
  triggered_from,
  result,
}: {
  event_detail: "create" | "update" | "delete";
  target_id: number;
  triggered_from: "inline" | "modal";
  result: "success" | "error";
}) => {
  trackSimpleEvent({
    event: "edit_data_record_modified",
    event_detail,
    target_id,
    triggered_from,
    result,
  });
};
