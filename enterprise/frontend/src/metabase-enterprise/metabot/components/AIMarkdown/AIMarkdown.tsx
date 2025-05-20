// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";

import Markdown, {
  type MarkdownProps,
} from "metabase/core/components/Markdown";

import S from "./AIMarkdown.module.css";

export const AIMarkdown = ({ className, ...props }: MarkdownProps) => (
  <Markdown className={cx(S.aiMarkdown, className)} {...props} />
);
