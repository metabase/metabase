import { Route } from "metabase/hoc/Title";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";

export function getBenchRoutes() {
  return <Route path="library/:path" component={PythonLibraryEditorPage} />;
}
