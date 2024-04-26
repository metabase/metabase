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
      <Markdown disallowHeading>
        {typeof children === "string" ? children.replace(/\s/g, " ") : children}
      </Markdown>
    </Ellipsified>
  );
};
