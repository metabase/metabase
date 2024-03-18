import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackTableClick = (tableId: number) =>
  trackSchemaEvent("browse_data", "1-0-0", {
    event: "browse_data_table_clicked",
    table_id: tableId,
  });
