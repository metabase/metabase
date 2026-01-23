import { useRegisterActions } from "kbar";
import { useCallback, useMemo } from "react";
import type { WithRouterProps } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  useDatabaseListQuery,
  useHasTokenFeature,
  useSearchListQuery,
} from "metabase/common/hooks";
import Collections from "metabase/entities/collections/collections";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { openDiagnostics } from "metabase/redux/app";
import {
  closeModal,
  setOpenModal,
  setOpenModalWithProps,
} from "metabase/redux/ui";
import { getHasDatabaseWithActionsEnabled } from "metabase/selectors/data";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
  getUserIsAdmin,
  getUserPersonalCollectionId,
} from "metabase/selectors/user";
import { useColorScheme } from "metabase/ui";
import type { ModalName } from "metabase-types/store/modal";

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

  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDatabaseWithActionsEnabled =
    getHasDatabaseWithActionsEnabled(databases);
  const hasModels = models.length > 0;
  const hasEmbedJsFeature = useHasTokenFeature("embedding_simple");

  const openNewModal = useCallback(
    (modalId: ModalName) => {
      dispatch(closeModal());
      dispatch(setOpenModal(modalId));
    },
    [dispatch],
  );
  const openNewModalWithProps = useCallback(
    <TProps extends Record<string, unknown>>(
      modalId: ModalName,
      props?: TProps,
    ) => {
      dispatch(closeModal());
      dispatch(setOpenModalWithProps({ id: modalId, props }));
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
                DEPRECATED_RAW_MBQL_type: "native",
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
      id: "create-new-document",
      name: t`New document`,
      section: "basic",
      icon: "document",
      perform: () => {
        dispatch(push(Urls.newDocument()));
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
      id: "download-diagnostics",
      name: t`Download diagnostics`,
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
        name: t`Browse metrics`,
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

    if (isAdmin && hasEmbedJsFeature) {
      actions.push({
        id: "navigate-embed-js",
        section: "basic",
        icon: "embed",
        keywords: "embed flow, new embed, embed js",
        perform: () =>
          openNewModalWithProps<
            Pick<SdkIframeEmbedSetupModalProps, "initialState">
          >("embed", {
            initialState: {
              isGuest: true,
              useExistingUserSession: true,
            },
          }),
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
    openNewModalWithProps,
    isAdmin,
    personalCollectionId,
    hasEmbedJsFeature,
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

  const colorSchemeRef = useLatest(useColorScheme());
  useRegisterShortcut([
    {
      id: "toggle-dark-mode",
      perform: () => colorSchemeRef.current.toggleColorScheme(),
    },
    {
      id: "toggle-dark-mode-2",
      perform: () => colorSchemeRef.current.toggleColorScheme(),
    },
  ]);
};
