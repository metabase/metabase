import { useMount } from "react-use";

import { useDispatch } from "metabase/redux";
import { useSearchParams } from "metabase/router";
import * as Urls from "metabase/urls";

import { WORKTREE_PARAM } from "../constants";
import { worktreeChanged } from "../sync-task-slice";

export const useWorktreeUrlParam = () => {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();

  useMount(() => {
    const worktreeId = Urls.extractEntityId(
      searchParams.get(WORKTREE_PARAM) ?? "",
    );
    if (worktreeId != null) {
      dispatch(worktreeChanged(worktreeId));
    }
  });
};
