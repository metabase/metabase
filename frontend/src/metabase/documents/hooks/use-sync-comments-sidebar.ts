import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useDispatch, useSelector } from "metabase/redux";

import { closeSidebar, openCommentsSidebar } from "../documents.slice";
import { getSidebarMode } from "../selectors";

interface UseSyncCommentsSidebarParams {
  areCommentsOpen: boolean;
  onCloseComments: () => void;
}

export const useSyncCommentsSidebar = ({
  areCommentsOpen,
  onCloseComments,
}: UseSyncCommentsSidebarParams) => {
  const dispatch = useDispatch();
  const sidebarMode = useSelector(getSidebarMode);
  const wereCommentsOpen = usePrevious(areCommentsOpen);

  useEffect(() => {
    // comments opened in URL - sync to Redux sidebar state
    if (!wereCommentsOpen && areCommentsOpen) {
      dispatch(openCommentsSidebar());
      return;
    }

    // comments closed in URL - sync to Redux sidebar state
    if (wereCommentsOpen && !areCommentsOpen && sidebarMode === "comments") {
      dispatch(closeSidebar());
      return;
    }

    // a different sidebar opened - sync to URL by removing the "/comments" path
    if (areCommentsOpen && sidebarMode !== "comments") {
      onCloseComments();
    }
  }, [
    wereCommentsOpen,
    areCommentsOpen,
    dispatch,
    sidebarMode,
    onCloseComments,
  ]);
};
