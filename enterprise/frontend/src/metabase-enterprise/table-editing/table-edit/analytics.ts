import { trackSimpleEvent } from "metabase/lib/analytics";
import type { ValidateEvent } from "metabase-types/analytics";

type TableEditingRecordModifiedEvent = ValidateEvent<{
  event: "edit_data_record_modified";
  event_detail: "create" | "update" | "delete";
  target_id: number;
  triggered_from: "inline" | "modal";
  result: "success" | "error";
}>;

export const trackDataRecordModified = ({
  event_detail,
  target_id,
  triggered_from,
  result,
}: Omit<TableEditingRecordModifiedEvent, "event">) => {
  trackSimpleEvent({
    event: "edit_data_record_modified",
    event_detail: event_detail,
    target_id: target_id,
    triggered_from: triggered_from,
    result,
  });
};
