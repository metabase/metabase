import type { DataAppComment, DataAppCommentRect } from "../types/comments";

/**
 * Where a comment's selection is on screen now: the box of the element its
 * selector still finds, or the box it was left at when the markup has since
 * changed. The fallback keeps a comment visible — in the wrong place rather than
 * nowhere — after an edit the author is about to look at.
 */
export const locateComment = (comment: DataAppComment): DataAppCommentRect => {
  const element = comment.target.selector
    ? document.querySelector(comment.target.selector)
    : null;

  return element?.getBoundingClientRect() ?? comment.target.rect;
};
