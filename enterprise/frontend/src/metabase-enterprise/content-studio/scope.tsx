import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  type ContentStudioSection,
  getCurrentSection,
} from "metabase/content-studio/app/pages/ContentStudioLayout";
import type { ContentStudioProviderProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useLocation, useNavigate, useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

export type ContentStudioScope = {
  /** The branch the studio is showing; `null` is the main branch. */
  worktreeId: RemoteSyncWorktreeId | null;
  /** The namespace on screen, and the root a change of branch lands on. */
  section: ContentStudioSection | null;
  setScope: (worktreeId: RemoteSyncWorktreeId | null) => void;
};

type EntityWorktreeId = RemoteSyncWorktreeId | null | undefined;

type ContentStudioScopeContextValue = ContentStudioScope & {
  setEntityWorktreeId: (worktreeId: EntityWorktreeId) => void;
  setEntitySection: (section: ContentStudioSection | undefined) => void;
};

const ContentStudioScopeContext =
  createContext<ContentStudioScopeContextValue | null>(null);

function getSectionUrl(
  section: ContentStudioSection | null,
  worktreeId: RemoteSyncWorktreeId | null,
) {
  const params = worktreeId != null ? { worktreeId } : {};

  return match(section)
    .with("transforms", () => Urls.contentStudioTransforms(params))
    .with("snippets", () => Urls.contentStudioSnippets(params))
    .with("collections", null, () => Urls.contentStudioCollections(params))
    .exhaustive();
}

export function ContentStudioScopeProvider({
  children,
}: ContentStudioProviderProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { worktrees, isEnabled, isFetching } = useWorktrees();
  const [entityWorktreeId, setEntityWorktreeId] =
    useState<EntityWorktreeId>(undefined);
  const [entitySection, setEntitySection] = useState<
    ContentStudioSection | undefined
  >(undefined);

  // A collection route names no namespace, so the loaded collection reports the
  // row it belongs to.
  const section = entitySection ?? getCurrentSection(pathname);
  const urlWorktreeId =
    Urls.extractEntityId(
      searchParams.get(Urls.CONTENT_STUDIO_WORKTREE_PARAM) ?? undefined,
    ) ?? null;

  // A list request in flight can be missing a branch that was just checked out,
  // so only an idle list is evidence that the branch is really gone.
  const isUnknownWorktree =
    urlWorktreeId != null &&
    isEnabled &&
    !isFetching &&
    !worktrees.some((worktree) => worktree.id === urlWorktreeId);

  useEffect(() => {
    if (!isUnknownWorktree) {
      return;
    }

    dispatch(
      addUndo({
        icon: "warning",
        message: t`That branch is no longer checked out. Showing the main branch instead.`,
      }),
    );
    navigate(getSectionUrl(section, null), { replace: true });
  }, [isUnknownWorktree, section, dispatch, navigate]);

  const setScope = useCallback(
    (worktreeId: RemoteSyncWorktreeId | null) => {
      setEntityWorktreeId(undefined);
      navigate(getSectionUrl(section, worktreeId));
    },
    [navigate, section],
  );

  const value = useMemo(() => {
    const urlScope = isEnabled && !isUnknownWorktree ? urlWorktreeId : null;

    return {
      worktreeId: entityWorktreeId !== undefined ? entityWorktreeId : urlScope,
      section,
      setScope,
      setEntityWorktreeId,
      setEntitySection,
    };
  }, [
    entityWorktreeId,
    isEnabled,
    isUnknownWorktree,
    section,
    urlWorktreeId,
    setScope,
  ]);

  return (
    <ContentStudioScopeContext.Provider value={value}>
      {children}
    </ContentStudioScopeContext.Provider>
  );
}

function useContentStudioScopeContext() {
  const value = useContext(ContentStudioScopeContext);

  if (!value) {
    throw new Error(
      "Content Studio scope is only available inside <ContentStudioScopeProvider>",
    );
  }

  return value;
}

export function useContentStudioScope(): ContentStudioScope {
  return useContentStudioScopeContext();
}

/**
 * Scopes the studio to the branch a loaded entity lives on, for detail routes
 * that identify their entity by id rather than by the URL's branch param.
 * Pass `undefined` while the entity is still loading. A `section` overrides the
 * row the URL alone would resolve to.
 */
export function useContentStudioEntityScope(
  worktreeId: EntityWorktreeId,
  section?: ContentStudioSection,
) {
  const { setEntityWorktreeId, setEntitySection } =
    useContentStudioScopeContext();

  useEffect(() => {
    setEntityWorktreeId(worktreeId);
    setEntitySection(section);

    return () => {
      setEntityWorktreeId(undefined);
      setEntitySection(undefined);
    };
  }, [worktreeId, section, setEntityWorktreeId, setEntitySection]);
}
