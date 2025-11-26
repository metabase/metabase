import { Route } from "react-router";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";

export function getPythonLibraryRoutes() {
  return <Route path="library/:path" component={PythonLibraryEditorPage} />;
}
