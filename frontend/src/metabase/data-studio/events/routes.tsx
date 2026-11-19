import { Route } from "metabase/router";

import { EventsPage } from "./pages/EventsPage";

export function getDataStudioEventsRoutes() {
  return <Route path="events" element={<EventsPage />} />;
}
