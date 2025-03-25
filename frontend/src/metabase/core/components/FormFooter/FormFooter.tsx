import cx from "classnames";
import type { PropsWithChildren } from "react";

import CS from "metabase/css/core/index.css";
import { Group, type GroupProps } from "metabase/ui";

export interface FormFooterProps extends GroupProps {
  hasTopBorder?: boolean;
  justify?: GroupProps["justify"];
}

export const FormFooter = ({
  hasTopBorder,
  children,
  justify = "right",
  ...props
}: PropsWithChildren<FormFooterProps>) => {
  const borderProps = hasTopBorder
    ? {
        mt: "sm",
        pt: "lg",
        className: cx(CS.borderTop, props.className),
      }
    : {};
  return (
    <Group
      align="center"
      justify={justify}
      gap="sm"
      {...props}
      {...borderProps}
    >
      {children}
    </Group>
  );
};
