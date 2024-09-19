import { Fragment, type ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Text, type TextProps } from "metabase/ui";

export const BoldCode = ({
  children,
  ...props
}: { children: ReactNode } & TextProps) => (
  <Text fw="bold" color="brand" component="span" {...props}>
    <code>{children}</code>
  </Text>
);

const Code = ({
  children,
  block,
}: {
  children: ReactNode;
  block?: boolean;
}) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Code;
