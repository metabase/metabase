import Markdown from "../Markdown";
import Tooltip, { type TooltipProps } from "../Tooltip";

import { TruncatedMarkdown } from "./MarkdownPreview.styled";

interface Props {
  children: string;
  className?: string;
  tooltipMaxWidth?: TooltipProps["maxWidth"];
}

const ALLOWED_ELEMENTS: string[] = [];

export const MarkdownPreview = ({
  children,
  className,
  tooltipMaxWidth,
}: Props) => (
  <Tooltip
    maxWidth={tooltipMaxWidth}
    placement="bottom"
    tooltip={
      <Markdown disallowHeading unstyleLinks>
        {children}
      </Markdown>
    }
  >
    <div>
      <TruncatedMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        className={className}
        unwrapDisallowed
      >
        {children}
      </TruncatedMarkdown>
    </div>
  </Tooltip>
);
