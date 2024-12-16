import { trackSchemaEvent } from "metabase/lib/analytics";
import type { ConcreteTableId } from "metabase-types/api";

export const trackTableClick = (tableId: ConcreteTableId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_table_clicked",
    table_id: tableId,
  });
