import { useRegisterActions, type Action } from "kbar";
import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
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
  getHasNativeWrite,
  getHasDatabaseWithActionsEnabled,
} from "metabase/selectors/data";

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
