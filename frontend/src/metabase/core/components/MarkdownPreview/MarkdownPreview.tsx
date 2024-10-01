import classNames from "classnames";
import type { ComponentProps, LegacyRef } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";

import Markdown from "../Markdown";
import Tooltip from "../Tooltip";

import C from "./MarkdownPreview.module.css";

export interface MarkdownPreviewProps {
  children: string;
  className?: string;
  tooltipMaxWidth?: ComponentProps<typeof Tooltip>["maxWidth"];
  lineClamp?: number;
  allowedElements?: string[];
  oneLine?: boolean;
}

const DEFAULT_ALLOWED_ELEMENTS: string[] = [];

export const MarkdownPreview = ({
  children,
  className,
  tooltipMaxWidth,
  lineClamp,
  allowedElements = DEFAULT_ALLOWED_ELEMENTS,
  oneLine,
}: MarkdownPreviewProps) => {
  const { isTruncated, ref } = useIsTruncated();

  const setReactMarkdownRef: LegacyRef<HTMLDivElement> = div => {
    /**
     * react-markdown API does not allow passing ref to the container div.
     * We can acquire the reference through its parent.
     */
    const reactMarkdownRoot = div?.firstElementChild;
    ref.current = reactMarkdownRoot || null;
  };

  return (
    <Tooltip
      maxWidth={tooltipMaxWidth}
      placement="bottom"
      isEnabled={isTruncated}
      tooltip={
        <Markdown dark disallowHeading unstyleLinks lineClamp={lineClamp}>
          {children}
        </Markdown>
      }
    >
      <div ref={setReactMarkdownRef}>
        <Markdown
          allowedElements={allowedElements}
          className={classNames(C.preview, className, oneLine && C.oneLine)}
          unwrapDisallowed
          lineClamp={1}
        >
          {children}
        </Markdown>
      </div>
    </Tooltip>
  );
};
