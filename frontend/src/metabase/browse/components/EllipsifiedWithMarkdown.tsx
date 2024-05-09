import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

export const EllipsifiedWithMarkdown = ({ children }: { children: string }) => {
  return (
    <Ellipsified
      tooltip={
        <Markdown disallowHeading unstyleLinks lineClamp={12}>
          {children}
        </Markdown>
      }
    >
      <Markdown disallowHeading>{children.replace(/\s/g, " ")}</Markdown>
    </Ellipsified>
  );
};
