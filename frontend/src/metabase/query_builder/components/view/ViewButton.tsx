import cx from "classnames";
import type { CSSProperties } from "react";

import Button, { type ButtonProps } from "metabase/core/components/Button";
import { useMantineTheme } from "metabase/ui";

import S from "./ViewButton.module.css";

interface Props extends ButtonProps {
  color?: string;
  active?: boolean;
}

// NOTE: some of this is duplicated from NotebookCell.jsx
const ViewButton = ({ className, active, color, ...props }: Props) => {
  const theme = useMantineTheme();

  return (
    <Button
      className={cx(S.ViewButton, { [S.active]: active }, className)}
      style={
        {
          "--view-button-color": color ?? theme.fn.themeColor("brand"),
        } as CSSProperties
      }
      {...props}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ViewButton;
