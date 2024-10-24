import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackAddDataViaCSV = () => {
  trackSimpleEvent({
    event: "data_add_via_csv_clicked",
  });
};

export const trackAddDataViaDatabase = () => {
  trackSimpleEvent({
    event: "data_add_via_db_clicked",
  });
};
