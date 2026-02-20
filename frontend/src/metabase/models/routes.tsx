import type { RouteObject } from "react-router-dom";
import {
  Navigate,
  Outlet,
  Route as RouterRoute,
  Routes,
} from "react-router-dom";

import ActionCreatorModal from "metabase/actions/containers/ActionCreatorModal/ActionCreatorModal";
import { ModelDetailPage } from "metabase/detail-view/pages/ModelDetailPage/ModelDetailPage";
import ModelActions from "metabase/models/containers/ModelActions/ModelActions";
import { createModalRoute, useCompatParams } from "metabase/routing/compat";
import { ModalRouteWrapper } from "metabase/routing/compat/ModalRouteWrapper";

const ModelActionsWithRouteProps = () => {
  const params = useCompatParams<{ slug?: string }>();

  return (
    <ModelActions params={{ slug: params.slug ?? "" }}>
      <Outlet />
    </ModelActions>
  );
};

const ModelDetailPageWithRouteProps = () => {
  const params = useCompatParams<{ slug?: string; rowId?: string }>();
  return (
    <ModelDetailPage
      params={{
        slug: params.slug ?? "",
        rowId: params.rowId ?? "",
      }}
    />
  );
};

const ActionCreatorModalWithRouteProps = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const params = useCompatParams<{ slug?: string; actionId?: string }>();

  return (
    <ActionCreatorModal
      params={{
        slug: params.slug ?? "",
        actionId: params.actionId,
      }}
      onClose={onClose}
    />
  );
};

export const getRoutes = () => (
  <Routes>
    <RouterRoute path="/model/:slug/detail">
      <RouterRoute path="actions" element={<ModelActionsWithRouteProps />}>
        <RouterRoute
          path="new"
          element={
            <ModalRouteWrapper
              modal={ActionCreatorModalWithRouteProps}
              modalProps={{
                wide: true,
                enableTransition: false,
                closeOnClickOutside: false,
              }}
            />
          }
        />
        <RouterRoute
          path=":actionId"
          element={
            <ModalRouteWrapper
              modal={ActionCreatorModalWithRouteProps}
              modalProps={{
                wide: true,
                enableTransition: false,
                closeOnClickOutside: false,
              }}
            />
          }
        />
      </RouterRoute>
      <RouterRoute path=":rowId" element={<ModelDetailPageWithRouteProps />} />
      <RouterRoute index element={<Navigate to="actions" replace />} />
      <RouterRoute path="usage" element={<Navigate to="actions" replace />} />
      <RouterRoute path="schema" element={<Navigate to="actions" replace />} />
      <RouterRoute path="*" element={<Navigate to="actions" replace />} />
    </RouterRoute>
  </Routes>
);

export const getModelRouteObjects = (): RouteObject[] => [
  {
    path: "/model/:slug/detail",
    children: [
      {
        path: "actions",
        element: <ModelActionsWithRouteProps />,
        children: [
          createModalRoute("new", ActionCreatorModalWithRouteProps, {
            modalProps: {
              wide: true,
              enableTransition: false,
              closeOnClickOutside: false,
            },
          }),
          createModalRoute(":actionId", ActionCreatorModalWithRouteProps, {
            modalProps: {
              wide: true,
              enableTransition: false,
              closeOnClickOutside: false,
            },
          }),
        ],
      },
      { path: ":rowId", element: <ModelDetailPageWithRouteProps /> },
      { index: true, element: <Navigate to="actions" replace /> },
      { path: "usage", element: <Navigate to="actions" replace /> },
      { path: "schema", element: <Navigate to="actions" replace /> },
      { path: "*", element: <Navigate to="actions" replace /> },
    ],
  },
];
