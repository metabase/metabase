import { useMemo, useState } from "react";

import {
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
} from "metabase/plugins";

export function useSnippetPlugins() {
  const [modalSnippetCollection, setModalSnippetCollection] =
    useState<unknown>(null);
  const [permissionsModalCollectionId, setPermissionsModalCollectionId] =
    useState<unknown>(null);

  const componentRef = useMemo(
    () => ({
      state: { modalSnippetCollection, permissionsModalCollectionId },
      setState: (state: {
        modalSnippetCollection?: unknown;
        permissionsModalCollectionId?: unknown;
      }) => {
        if (state.modalSnippetCollection !== undefined) {
          setModalSnippetCollection(state.modalSnippetCollection);
        }
        if (state.permissionsModalCollectionId !== undefined) {
          setPermissionsModalCollectionId(state.permissionsModalCollectionId);
        }
      },
      props: {
        snippetCollection: { id: null as number | string | null },
      },
    }),
    [modalSnippetCollection, permissionsModalCollectionId],
  );

  const menuOptions = useMemo(
    () => PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.map((f) => f(componentRef)),
    [componentRef],
  );

  const modals = useMemo(
    () =>
      PLUGIN_SNIPPET_SIDEBAR_MODALS.map((f, index) => ({
        key: index,
        element: f(componentRef),
      })),
    [componentRef],
  );

  return { menuOptions, modals };
}
