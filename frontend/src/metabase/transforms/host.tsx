import { type ReactNode, createContext, useContext, useMemo } from "react";

import { useMaybeLocation } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  CardId,
  CollectionId,
  RemoteSyncWorktreeId,
  TransformId,
} from "metabase-types/api";

export type NewTransformSourceType = "query" | "native" | "python";

/**
 * The app area the transform pages are mounted in: where its transform routes
 * live, which branch new transforms are created into, and how much page chrome
 * it draws around them. A `null` builder marks a page the host does not have,
 * so links to it are left out.
 */
export type TransformHost = {
  /** The branch transforms are created into; `null` is the main app. */
  worktreeId: RemoteSyncWorktreeId | null;
  /** Landing page for the transform tree — the breadcrumb root and cancel target. */
  rootUrl: string;
  getTransformUrl: (transformId: TransformId) => string;
  getTransformEditUrl: (transformId: TransformId) => string;
  getTransformRunUrl: (transformId: TransformId) => string;
  getTransformSettingsUrl: (transformId: TransformId) => string;
  getTransformIndexesUrl: (transformId: TransformId) => string;
  getTransformInspectUrl: ((transformId: TransformId) => string) | null;
  getTransformDependenciesUrl: ((transformId: TransformId) => string) | null;
  getTransformRunListUrl: ((transformId: TransformId) => string) | null;
  getNewTransformUrl: (sourceType: NewTransformSourceType) => string;
  getNewTransformFromCardUrl: (cardId: CardId) => string;
  /** Breadcrumb target for a folder; folders render as plain text when null. */
  getFolderUrl: ((collectionId: CollectionId) => string) | null;
  /** Whether the host already draws the page's outer padding and app switcher. */
  hasHostChrome: boolean;
};

const TransformHostContext = createContext<TransformHost | null>(null);

type TransformHostProviderProps = {
  value: TransformHost;
  children: ReactNode;
};

export function TransformHostProvider({
  value,
  children,
}: TransformHostProviderProps) {
  return (
    <TransformHostContext.Provider value={value}>
      {children}
    </TransformHostContext.Provider>
  );
}

export function useTransformHost(): TransformHost {
  const host = useContext(TransformHostContext);
  const location = useMaybeLocation();
  // Python authoring is hosted in Data Studio even when it is reached from Content Studio,
  // which names the branch the new transform belongs in on the URL.
  const worktreeId =
    Urls.extractEntityId(
      new URLSearchParams(location?.search).get("worktreeId") ?? undefined,
    ) ?? null;

  return useMemo(() => {
    if (host != null) {
      return host;
    }
    return worktreeId != null
      ? { ...DATA_STUDIO_TRANSFORM_HOST, worktreeId }
      : DATA_STUDIO_TRANSFORM_HOST;
  }, [host, worktreeId]);
}

const NEW_TRANSFORM_URLS = {
  query: Urls.newQueryTransform,
  native: Urls.newNativeTransform,
  python: Urls.newPythonTransform,
} satisfies Record<NewTransformSourceType, () => string>;

const DATA_STUDIO_TRANSFORM_HOST: TransformHost = {
  worktreeId: null,
  rootUrl: Urls.transformList(),
  getTransformUrl: Urls.transform,
  getTransformEditUrl: Urls.transformEdit,
  getTransformRunUrl: Urls.transformRun,
  getTransformSettingsUrl: Urls.transformSettings,
  getTransformIndexesUrl: Urls.transformIndexes,
  getTransformInspectUrl: Urls.transformInspect,
  getTransformDependenciesUrl: Urls.transformDependencies,
  getTransformRunListUrl: (transformId) =>
    Urls.transformRunList({ transformIds: [transformId] }),
  getNewTransformUrl: (sourceType) => NEW_TRANSFORM_URLS[sourceType](),
  getNewTransformFromCardUrl: Urls.newTransformFromCard,
  getFolderUrl: (collectionId) => Urls.transformList({ collectionId }),
  hasHostChrome: false,
};
