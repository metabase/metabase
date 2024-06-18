import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

export const EllipsifiedWithMarkdownTooltip = ({
  children,
}: {
  children: string;
}) => {
  return (
    <Ellipsified
      tooltip={
        <Markdown disallowHeading unstyleLinks lineClamp={12}>
          {children}
        </Markdown>
      }
    >
      {children}
    </Ellipsified>
  );
};
