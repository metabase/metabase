import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { Route, redirect, withRouteProps } from "metabase/router";
import {
  type ModalProps,
  PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
} from "metabase/ui";

const RoutedModelActions = withRouteProps(ModelActions);
const RoutedModelDetailPage = withRouteProps(ModelDetailPage);

export const getRoutes = () => {
  const modalProps: Partial<ModalProps> = {
    ...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS,
    size: "95%",
  };
  return (
    <Route path="/model/:slug/detail">
      <Route path="actions" element={<RoutedModelActions />}>
        {modalRoute("new", ActionCreatorModal, { modalProps })}
        {modalRoute(":actionId", ActionCreatorModal, { modalProps })}
      </Route>
      <Route path=":rowId" element={<RoutedModelDetailPage />} />
      <Route index component={redirect("actions")} />
      <Route path="usage" component={redirect("actions")} />
      <Route path="schema" component={redirect("actions")} />
      <Route path="*" component={redirect("actions")} />
    </Route>
  );
};
