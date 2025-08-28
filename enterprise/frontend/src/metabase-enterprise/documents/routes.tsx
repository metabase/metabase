import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";

import { CommentsSidesheet } from "./components/CommentsSidesheet";
import { DocumentPage } from "./components/DocumentPage";

export const getRoutes = () => (
  <Route path="document/:entityId" component={DocumentPage}>
    <ModalRoute
      path="comments/:targetChildId"
      modal={CommentsSidesheet}
      noWrap
      modalProps={{
        // wide: true,
        enableTransition: false,
        closeOnClickOutside: false, // logic in component is reversed, so false is true.
      }}
    />
  </Route>
);
