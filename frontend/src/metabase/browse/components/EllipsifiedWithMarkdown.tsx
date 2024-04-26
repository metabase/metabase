import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

export const EllipsifiedWithMarkdown = ({
  shouldMarkdownifyTooltipTarget = false,
  shouldMarkdownifyTooltip = true,
  children,
}: {
  /** NOTE: If the tooltip target is markdownified,
   * useIsTruncated won't know whether it has been truncated */
  shouldMarkdownifyTooltipTarget?: boolean;
  shouldMarkdownifyTooltip?: boolean;
  children: string;
}) => {
  const tooltip = shouldMarkdownifyTooltip ? (
    <Markdown disallowHeading unstyleLinks lineClamp={12}>
      {children}
    </Markdown>
  ) : (
    children
  );
  const tooltipTarget = shouldMarkdownifyTooltipTarget ? (
    <Markdown disallowHeading>{children}</Markdown>
  ) : (
    children
  );
  return <Ellipsified tooltip={tooltip}>{tooltipTarget}</Ellipsified>;
};
