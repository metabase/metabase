import cx from "classnames";
import type { ReactNode } from "react";

import {
  Button,
  type ButtonProps,
  Icon,
  type IconName,
  Tooltip,
} from "metabase/ui";

import S from "./NavButton.module.css";

interface Props extends ButtonProps {
  icon: IconName;
  tooltip: ReactNode;
}

export const NavButton = ({ icon, tooltip, onClick, ...props }: Props) => (
  <Tooltip disabled={!onClick} label={tooltip}>
    <Button
      c="text-dark"
      className={cx(props.className, {
        [S.disabled]: !onClick,
      })}
      disabled={!onClick}
      h={32}
      leftSection={<Icon name={icon} />}
      variant="subtle"
      w={32}
      onClick={onClick}
      {...props}
    />
  </Tooltip>
);
