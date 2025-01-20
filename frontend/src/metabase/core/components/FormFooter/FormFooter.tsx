import type { PropsWithChildren } from "react";

import CS from "metabase/css/core/index.css";
import { Group } from "metabase/ui";
interface FormFooterProps {
  hasTopBorder?: boolean;
}

export const FormFooter = ({
  hasTopBorder,
  children,
}: PropsWithChildren<FormFooterProps>) => {
  const borderProps = hasTopBorder
    ? {
        mt: "sm",
        pt: "lg",
        className: CS.borderTop,
      }
    : {};
  return (
    <Group align="center" position="right" spacing="sm" {...borderProps}>
      {children}
    </Group>
  );
};
