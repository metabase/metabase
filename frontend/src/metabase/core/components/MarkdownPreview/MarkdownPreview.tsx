import type { ComponentProps, LegacyRef } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";

import Markdown from "../Markdown";
import Tooltip from "../Tooltip";

import { TruncatedMarkdown } from "./MarkdownPreview.styled";

interface Props {
  children: string;
  className?: string;
  tooltipMaxWidth?: ComponentProps<typeof Tooltip>["maxWidth"];
}

const ALLOWED_ELEMENTS: string[] = [];

export const MarkdownPreview = ({
  children,
  className,
  tooltipMaxWidth,
}: Props) => {
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
        <Markdown dark disallowHeading unstyleLinks>
          {children}
        </Markdown>
      }
    >
      <div ref={setReactMarkdownRef}>
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
};
