import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";

import { CommentsSidesheet } from "./components/CommentsSidesheet";
import { DocumentPage } from "./components/DocumentPage";

export const getRoutes = () => (
  <Route path="document/:entityId" component={DocumentPage}>
    <ModalRoute
      path="comments/:childTargetId"
      modal={CommentsSidesheet}
      noWrap
      modalProps={{
        enableTransition: false,
        closeOnClickOutside: false,
      }}
    />
  </Route>
);
