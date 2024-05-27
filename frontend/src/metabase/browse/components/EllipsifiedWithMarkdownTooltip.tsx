import { Ellipsified } from "metabase/core/components/Ellipsified";
import type { EllipsifiedProps } from "metabase/core/components/Ellipsified/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

export const EllipsifiedWithMarkdownTooltip = ({
  children,
  ...props
}: {
  children: string;
} & Partial<EllipsifiedProps>) => {
  return (
    <Ellipsified
      tooltip={
        <Markdown disallowHeading unstyleLinks lineClamp={12}>
          {children}
        </Markdown>
      }
      {...props}
    >
      {children}
    </Ellipsified>
  );
};
