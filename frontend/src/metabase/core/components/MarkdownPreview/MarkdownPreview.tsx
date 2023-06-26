import { ComponentProps, LegacyRef } from "react";

import { useIsTruncated } from "metabase/hooks/use-is-truncated";

import Tooltip from "../Tooltip";

import { TooltipMarkdown, TruncatedMarkdown } from "./MarkdownPreview.styled";

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

  const setReactMarkdownRef: LegacyRef<HTMLDivElement> = divRef => {
    /**
     * react-markdown API does not allow passing ref to the container div.
     * We can acquire the reference through its parent.
     */
    const reactMarkdownRoot = divRef?.querySelector("div");
    ref.current = reactMarkdownRoot || null;
  };

  return (
    <Tooltip
      maxWidth={tooltipMaxWidth}
      placement="bottom"
      isEnabled={isTruncated}
      tooltip={
        <TooltipMarkdown disallowHeading unstyleLinks>
          {children}
        </TooltipMarkdown>
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
