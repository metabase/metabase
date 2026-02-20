import { Route } from "metabase/routing/compat/react-router-v3";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";

export function getPythonLibraryRoutes() {
  return <Route path="library/:path" component={PythonLibraryEditorPage} />;
}
