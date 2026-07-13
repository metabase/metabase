import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { Route, redirect } from "metabase/router";
import {
  type ModalProps,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";

export const getRoutes = () => {
  const modalProps: Partial<ModalProps> = {
    ...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
    size: "95%",
  };
  return (
    <Route path="/model/:slug/detail">
      <Route path="actions" component={ModelActions}>
        <ModalRoute
          path="new"
          modal={ActionCreatorModal}
          modalProps={modalProps}
        />
        <ModalRoute
          path=":actionId"
          modal={ActionCreatorModal}
          modalProps={modalProps}
        />
      </Route>
      <Route path=":rowId" component={ModelDetailPage} />
      <Route index component={redirect("actions")} />
      <Route path="usage" component={redirect("actions")} />
      <Route path="schema" component={redirect("actions")} />
      <Route path="*" component={redirect("actions")} />
    </Route>
  );
};
