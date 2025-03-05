import type { PropsWithChildren } from "react";

import CS from "metabase/css/core/index.css";
import { Group, type GroupProps } from "metabase/ui";
interface FormFooterProps {
  hasTopBorder?: boolean;
  justify?: GroupProps["justify"];
}

export const FormFooter = ({
  hasTopBorder,
  children,
  justify = "right",
}: PropsWithChildren<FormFooterProps>) => {
  const borderProps = hasTopBorder
    ? {
        mt: "sm",
        pt: "lg",
        className: CS.borderTop,
      }
    : {};
  return (
    <Group align="center" justify={justify} gap="sm" {...borderProps}>
      {children}
    </Group>
  );
};
