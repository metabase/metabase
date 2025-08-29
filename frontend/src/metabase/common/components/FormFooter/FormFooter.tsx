import cx from "classnames";
import type { PropsWithChildren } from "react";

import CS from "metabase/css/core/index.css";
import { Group, type GroupProps } from "metabase/ui";
interface FormFooterProps extends GroupProps {
  hasTopBorder?: boolean;
  justify?: GroupProps["justify"];
  className?: string;
}

export const FormFooter = ({
  hasTopBorder,
  children,
  justify = "right",
  className,
  ...extraGroupProps
}: PropsWithChildren<FormFooterProps>) => {
  const groupProps = hasTopBorder
    ? {
        mt: "sm",
        pt: "lg",
        className: cx(className, CS.borderTop),
      }
    : { className };
  return (
    <Group
      align="center"
      justify={justify}
      gap="sm"
      {...groupProps}
      {...extraGroupProps}
    >
      {children}
    </Group>
  );
};
