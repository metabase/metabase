import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

import C from "./EllipsifiedWithMarkdownTooltip.module.css";

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
      <Markdown
        disallowHeading
        unstyleLinks
        lineClamp={1}
        className={C.inlineMarkdown}
      >
        {children}
      </Markdown>
    </Ellipsified>
  );
};
