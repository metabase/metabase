import type { ReactNode } from "react";
import { Fragment } from "react";

import CS from "metabase/css/core/index.css";
import type { TextProps } from "metabase/ui";
import { Text } from "metabase/ui";

interface BoldCodeProps extends TextProps {
  children: ReactNode;
}

export const BoldCode = ({ children, ...props }: BoldCodeProps) => (
  <Text fw="bold" color="brand" component="span" {...props}>
    <code>{children}</code>
  </Text>
);

interface CodeProps {
  children: ReactNode;
  block?: boolean;
}

export const Code = ({ children, block }: CodeProps) => {
  if (block) {
    return <div className={CS.textCode}>{children}</div>;
  } else if (typeof children === "string" && children.split(/\n/g).length > 1) {
    return (
      <span>
        {children.split(/\n/g).map((line, index) => (
          <Fragment key={index}>
            <span className={CS.textCode} style={{ lineHeight: "1.8em" }}>
              {line}
            </span>
            <br />
          </Fragment>
        ))}
      </span>
    );
  } else {
    return <span className={CS.textCode}>{children}</span>;
  }
};
