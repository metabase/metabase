import { useRegisterActions } from "kbar";
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
import { openDiagnostics } from "metabase/redux/app";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import {
  getHasDataAccess,
  getHasDatabaseWithActionsEnabled,
  getHasNativeWrite,
} from "metabase/selectors/data";
import {
  getUserIsAdmin,
  getUserPersonalCollectionId,
} from "metabase/selectors/user";

import {
  type RegisterShortcutProps,
  useRegisterShortcut,
} from "./useRegisterShortcut";

export const useCommandPaletteBasicActions = ({
  isLoggedIn,
  ...props
}: WithRouterProps & { isLoggedIn: boolean }) => {
  const dispatch = useDispatch();
  const collectionId = useSelector((state) =>
    Collections.selectors.getInitialCollectionId(state, props),
  );

  const { data: databases = [] } = useDatabaseListQuery({
    enabled: isLoggedIn,
  });
  const { data: models = [] } = useSearchListQuery({
    query: { models: ["dataset"], limit: 1 },
    enabled: isLoggedIn,
  });

  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const isAdmin = useSelector(getUserIsAdmin);

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

  const initialActions = useMemo<RegisterShortcutProps[]>(() => {
    const actions: RegisterShortcutProps[] = [];

    if (hasDataAccess) {
      actions.push({
        id: "create-new-question",
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
        id: "create-new-native-query",
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

    actions.push({
      id: "create-new-dashboard",
      name: t`New dashboard`,
      section: "basic",
      icon: "dashboard",
      perform: () => {
        openNewModal("dashboard");
      },
    });
    actions.push({
      id: "create-new-collection",
      name: t`New collection`,
      section: "basic",
      icon: "collection",
      perform: () => {
        openNewModal("collection");
      },
    });

    if (hasNativeWrite) {
      actions.push({
        id: "create-new-model",
        name: t`New model`,
        section: "basic",
        icon: "model",
        perform: () => {
          dispatch(closeModal());
          dispatch(push("model/new"));
        },
      });
    }

    if (hasDataAccess) {
      actions.push({
        id: "create-new-metric",
        name: t`New metric`,
        section: "basic",
        icon: "metric",
        perform: () => {
          dispatch(closeModal());
          dispatch(push("metric/query"));
          dispatch(
            push(
              Urls.newQuestion({
                mode: "query",
                cardType: "metric",
                collectionId,
              }),
            ),
          );
        },
      });
    }

    actions.push({
      id: "report-issue",
      name: t`Report an issue`,
      section: "basic",
      icon: "bug",
      keywords: "bug, issue, problem, error, diagnostic",
      shortcut: ["$mod+f1"],
      perform: () => {
        dispatch(openDiagnostics());
      },
    });

    const browseActions: RegisterShortcutProps[] = [
      {
        id: "navigate-browse-model",
        name: t`Browse models`,
        section: "basic",
        icon: "model",
        perform: () => {
          dispatch(push("/browse/models"));
        },
      },
      {
        id: "navigate-browse-database",
        name: t`Browse databases`,
        section: "basic",
        icon: "database",
        perform: () => {
          dispatch(push("/browse/databases"));
        },
      },
      {
        id: "navigate-browse-metric",
        name: t`Browse Metrics`,
        section: "basic",
        icon: "metric",
        perform: () => {
          dispatch(push("/browse/metrics"));
        },
      },
    ];

    if (isAdmin) {
      actions.push({
        id: "navigate-admin-settings",
        perform: () => dispatch(push("/admin/settings")),
      });
    }

    if (personalCollectionId) {
      actions.push({
        id: "navigate-personal-collection",
        perform: () => dispatch(push(`/collection/${personalCollectionId}`)),
      });
    }

    actions.push(
      {
        id: "navigate-user-settings",
        perform: () => dispatch(push("/account/profile")),
      },
      {
        id: "navigate-trash",
        perform: () => dispatch(push("/trash")),
      },
      {
        id: "navigate-home",
        perform: () => dispatch(push("/")),
      },
    );

    return [...actions, ...browseActions];
  }, [
    dispatch,
    hasDataAccess,
    hasNativeWrite,
    collectionId,
    openNewModal,
    isAdmin,
    personalCollectionId,
  ]);

  useRegisterShortcut(initialActions, [initialActions]);

  const openActionModal = [];

  if (hasDatabaseWithActionsEnabled && hasNativeWrite && hasModels) {
    openActionModal.push({
      id: "create-action",
      name: t`New action`,
      section: "basic",
      icon: "bolt",
      perform: () => {
        openNewModal("action");
      },
    });
  }
  useRegisterActions(openActionModal, [
    hasDatabaseWithActionsEnabled,
    hasNativeWrite,
    hasModels,
  ]);
};
