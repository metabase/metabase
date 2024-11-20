import { Portal as MantinePortal, type PortalProps } from "@mantine/core";
export { type PortalProps } from "@mantine/core";
export { getPortalOverrides } from "./Portal.styled";
import cx from "classnames";

import ZIndex from "metabase/css/core/z-index.module.css";

export const Portal = (props: PortalProps) => {
  return (
    <MantinePortal
      {...props}
      className={cx(props.className, ZIndex.FloatingElement)}
    />
  );
};
