import { type Action, useRegisterActions } from "kbar";
import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { redirect } from "metabase/lib/dom";
import { t } from "ttag";

import {
  useDatabaseListQuery,
  useSearchListQuery,
} from "metabase/common/hooks";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import {
  getHasDataAccess,
  getHasDatabaseWithActionsEnabled,
  getHasNativeWrite,
} from "metabase/selectors/data";
import { KitchenSinkAPI } from "metabase/services";

export const useCommandPaletteBasicActions = ({
  isLoggedIn,
  ...props
}: WithRouterProps & { isLoggedIn: boolean }) => {
  const dispatch = useDispatch();
  const collectionId = useSelector(state =>
    Collections.selectors.getInitialCollectionId(state, props),
  );

  const { data: databases = [] } = useDatabaseListQuery({
    enabled: isLoggedIn,
  });
  const { data: models = [] } = useSearchListQuery({
    query: { models: ["dataset"], limit: 1 },
    enabled: isLoggedIn,
  });

  const hasDataAccess = getHasDataAccess(databases);
  const hasNativeWrite = getHasNativeWrite(databases);
  const hasDatabaseWithActionsEnabled =
    getHasDatabaseWithActionsEnabled(databases);
  const hasModels = models.length > 0;

  const openNewModal = useCallback(
    (modalId: string) => {
      dispatch(closeModal());
      dispatch(setOpenModal(modalId));
    },
    [dispatch],
  );

  const initialActions = useMemo<Action[]>(() => {
    const actions: Action[] = [];

    if (hasDataAccess) {
      actions.push({
        id: "new_question",
        name: t`New question`,
        section: "basic",
        icon: "insight",
        perform: () => {
          dispatch(closeModal());
          dispatch(
            push(
              Urls.newQuestion({
                mode: "notebook",
                creationType: "custom_question",
                cardType: "question",
                collectionId,
              }),
            ),
          );
        },
      });
    }

    if (hasNativeWrite) {
      actions.push({
        id: "new_query",
        name: t`New SQL query`,
        section: "basic",
        icon: "sql",
        perform: () => {
          dispatch(closeModal());
          dispatch(
            push(
              Urls.newQuestion({
                type: "native",
                creationType: "native_question",
                cardType: "question",
              }),
            ),
          );
        },
      });
    }

    actions.push(
      ...[
        {
          id: "new_dashboard",
          name: t`New dashboard`,
          section: "basic",
          icon: "dashboard",
          perform: () => {
            openNewModal("dashboard");
          },
        },
        {
          id: "new_collection",
          name: t`New collection`,
          section: "basic",
          icon: "collection",
          perform: () => {
            openNewModal("collection");
          },
        },
      ],
    );

    actions.push(
      ...[
        {
          id: "make_kitchen_sink_1",
          name: t`Kitchen Sink One`,
          section: "admin",
          icon: "beaker",
          perform: async () => {
            location = await KitchenSinkAPI.makeKitchenSink({ sink: "a_look_at_orders" })["goto"];
            redirect(location);
          },
        },
        {
          id: "make_kitchen_sink_2",
          name: t`Kitchen Sink Two`,
          section: "admin",
          icon: "cloud",
          perform: async () => {
            location = await KitchenSinkAPI.makeKitchenSink({
              sink: "a_look_at_invoices",
            })["goto"];
            redirect(location);
          },
        },
        {
          id: "make_kitchen_sink_3",
          name: t`Make big ol' kitchen sink`,
          section: "admin",
          icon: "cloud",
          perform: async () => {
            location = await KitchenSinkAPI.makeKitchenSink({
              sink: "dash_with_actions",
            })["goto"];
            redirect(location);
          },
        },
        {
          id: "sandbox_me",
          name: t`Sandbox Me`,
          section: "admin",
          icon: "lightning",
          perform: async () => {
            await KitchenSinkAPI.makeMeASandbox({})
            redirect(window.location.href);
          }
        },
        {
          id: "admin_me",
          name: t`Admin Me`,
          section: "admin",
          icon: "lightning",
          perform: async () => {
            await KitchenSinkAPI.makeMeAnAdmin({})
            redirect(window.location.href);
          }
        }
      ],
    );

    if (hasNativeWrite) {
      actions.push({
        id: "new_model",
        name: t`New model`,
        section: "basic",
        icon: "model",
        perform: () => {
          dispatch(closeModal());
          dispatch(push("model/new"));
        },
      });
    }

    if (hasDatabaseWithActionsEnabled && hasNativeWrite && hasModels) {
      actions.push({
        id: "new_action",
        name: t`New action`,
        section: "basic",
        icon: "bolt",
        perform: () => {
          openNewModal("action");
        },
      });
    }

    const browseActions: Action[] = [
      {
        id: "navigate_models",
        name: t`Browse models`,
        section: "basic",
        icon: "model",
        perform: () => {
          dispatch(push("/browse/models"));
        },
      },
      {
        id: "navigate_data",
        name: t`Browse databases`,
        section: "basic",
        icon: "database",
        perform: () => {
          dispatch(push("/browse/databases"));
        },
      },
    ];

    return [...actions, ...browseActions];
  }, [
    dispatch,
    hasDataAccess,
    hasDatabaseWithActionsEnabled,
    hasNativeWrite,
    hasModels,
    collectionId,
    openNewModal,
  ]);

  useRegisterActions(initialActions, [initialActions]);
};
