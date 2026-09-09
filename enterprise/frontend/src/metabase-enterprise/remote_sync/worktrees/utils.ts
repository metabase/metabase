import * as Urls from "metabase/urls";
import type { Worktree } from "metabase-types/api";

export function isWithin(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

/** The worktree whose pages the current location is inside of, if any. */
export function findActiveWorktree(
  worktrees: Worktree[],
  pathname: string,
): Worktree | undefined {
  return worktrees.find((worktree) =>
    isWithin(pathname, Urls.dataStudioWorktree(worktree.id)),
  );
}
