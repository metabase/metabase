import { Route } from "react-router";

import { EventsPage } from "./pages/EventsPage";

export function getDataStudioEventsRoutes() {
  return <Route path="events" component={EventsPage} />;
}
