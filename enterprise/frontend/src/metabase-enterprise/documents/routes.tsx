import { Route } from "metabase/hoc/Title";

import { DocumentPage } from "./components/DocumentPage";
import { QuestionCreator } from "./components/QuestionCreator";

export const getRoutes = () => (
  <>
    <Route path="document/:id" component={DocumentPage} />
    <Route path="sql-gen" component={QuestionCreator} />
  </>
);
