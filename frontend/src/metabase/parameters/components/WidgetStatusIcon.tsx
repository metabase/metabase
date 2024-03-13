import styled from "@emotion/styled";
import cx from "classnames";
import type { MouseEvent } from "react";

import { Icon } from "metabase/ui";

type Props = {
  name: "close" | "empty" | "chevrondown" | "time_history";
  onClick?: () => void;
};

const StyledIcon = styled(Icon)`
  inset-inline-end: 0;
`;

export function WidgetStatusIcon({ name, onClick }: Props) {
  const classes = cx({
    "cursor-pointer": ["close", "time_history"].includes(name),
  });

  const handleOnClick = (e: MouseEvent) => {
    if (onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  return (
    <StyledIcon
      name={name}
      onClick={handleOnClick}
      size={12}
      className={classes}
    />
  );
}
