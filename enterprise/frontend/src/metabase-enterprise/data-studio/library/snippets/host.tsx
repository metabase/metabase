import { type ReactNode, createContext, useContext } from "react";

import * as Urls from "metabase/urls";
import type {
  CollectionId,
  NativeQuerySnippetId,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

/**
 * The app area the snippet pages are mounted in: where its snippet routes live,
 * which branch a new snippet is created into, and how much page chrome it draws
 * around them.
 */
export type SnippetHost = {
  /** The branch snippets are created into; `null` is the main app. */
  worktreeId: RemoteSyncWorktreeId | null;
  /** Landing page for the snippet tree — the breadcrumb root and cancel target. */
  rootUrl: string;
  archivedSnippetsUrl: string;
  getSnippetUrl: (snippetId: NativeQuerySnippetId) => string;
  getSnippetDependenciesUrl: (snippetId: NativeQuerySnippetId) => string;
  /** Breadcrumb target for a folder; folders render as plain text when null. */
  getFolderUrl: ((folderIds: CollectionId[]) => string) | null;
  /** Whether the host already draws the page's outer padding and app switcher. */
  hasHostChrome: boolean;
};

const SnippetHostContext = createContext<SnippetHost | null>(null);

type SnippetHostProviderProps = {
  value: SnippetHost;
  children: ReactNode;
};

export function SnippetHostProvider({
  value,
  children,
}: SnippetHostProviderProps) {
  return (
    <SnippetHostContext.Provider value={value}>
      {children}
    </SnippetHostContext.Provider>
  );
}

export function useSnippetHost(): SnippetHost {
  return useContext(SnippetHostContext) ?? DATA_STUDIO_SNIPPET_HOST;
}

const DATA_STUDIO_SNIPPET_HOST: SnippetHost = {
  worktreeId: null,
  rootUrl: Urls.dataStudioLibrary(),
  archivedSnippetsUrl: Urls.dataStudioArchivedSnippets(),
  getSnippetUrl: Urls.dataStudioSnippet,
  getSnippetDependenciesUrl: Urls.dataStudioSnippetDependencies,
  getFolderUrl: (folderIds) =>
    Urls.dataStudioLibrary({ expandedIds: ["root", ...folderIds] }),
  hasHostChrome: false,
};
