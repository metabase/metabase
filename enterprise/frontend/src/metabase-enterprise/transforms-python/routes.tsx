import { Redirect, Route } from "react-router";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import { NewAdvancedTransformPage } from "metabase/transforms/pages/NewTransformPage";
import { TransformListPage } from "metabase/transforms/pages/TransformListPage";

import { PythonLibraryEditorPage } from "./pages/PythonLibraryEditorPage";
import { PythonTransformsUpsellModal } from "./upsells/PythonTransformsUpsellModal";

export function getPythonTransformsRoutes() {
  return (
    <>
      <Route path="library/:path" component={PythonLibraryEditorPage} />
      <Redirect from="new/python" to="new/advanced/python" />
      <Redirect from="new/advanced" to="new/advanced/python" />
      <Route path="new/advanced/:type" component={NewAdvancedTransformPage} />
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
      <Redirect from="new/python" to="new/advanced/python" />
      <ModalRoute
        path="new/advanced/:type"
        modal={PythonTransformsUpsellModal}
        noWrap
      />
    </Route>
  );
}
