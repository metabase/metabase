import { Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { NewPythonTransformPage } from "metabase/transforms/pages/NewTransformPage";
import { TransformListPage } from "metabase/transforms/pages/TransformListPage";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonTransformsUpsellModal } from "./upsells/PythonTransformsUpsellModal";

export function getPythonTransformsRoutes() {
  return (
    <>
      <Route path="library/:path" component={PythonLibraryEditorPage} />
      <Route path="new/python" component={NewPythonTransformPage} />
    </>
  );
}

export function getPythonUpsellRoutes() {
  return (
    // Render upsell modal on python transforms routes if feature is not enabled
    <Route path="" component={TransformListPage}>
      <ModalRoute
        path="library/:path"
        modal={PythonTransformsUpsellModal}
        noWrap
      />
      <ModalRoute
        path="new/python"
        modal={PythonTransformsUpsellModal}
        noWrap
      />
    </Route>
  );
}
