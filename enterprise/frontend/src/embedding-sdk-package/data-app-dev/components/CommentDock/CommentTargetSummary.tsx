import type { DataAppCommentTarget } from "../../types/comments";

import S from "./CommentDock.module.css";

interface Props {
  target: DataAppCommentTarget;
}

/** The one line that says what a comment is attached to, in source terms. */
export const CommentTargetSummary = ({ target }: Props) => (
  <div className={S.Target}>
    {target.source
      ? `${target.source.file}:${target.source.line}`
      : target.selector || "unknown element"}
    {target.componentPath.length > 0 &&
      ` · ${target.componentPath.join(" › ")}`}
    {target.kind === "region" && " · region"}
  </div>
);
