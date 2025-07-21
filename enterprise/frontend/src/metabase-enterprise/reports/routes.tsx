import { Route } from "metabase/hoc/Title";

import { ReportPage } from "./components/ReportPage";

export const getRoutes = () => <Route path="report" component={ReportPage} />;
