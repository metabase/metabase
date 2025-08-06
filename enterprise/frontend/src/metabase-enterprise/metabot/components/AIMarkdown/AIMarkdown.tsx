// TODO: consolidate this component w/ AIAnalysisContent

import cx from "classnames";
import { memo } from "react";

import Markdown, {
  type MarkdownProps,
} from "metabase/common/components/Markdown";

import S from "./AIMarkdown.module.css";

export const AIMarkdown = memo(({ className, ...props }: MarkdownProps) => (
  <Markdown className={cx(S.aiMarkdown, className)} {...props} />
));
AIMarkdown.displayName = "AIMarkdown";
