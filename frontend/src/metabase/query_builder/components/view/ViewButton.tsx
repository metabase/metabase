import cx from "classnames";
import type { CSSProperties } from "react";

import Button, { type ButtonProps } from "metabase/core/components/Button";

import S from "./ViewButton.module.css";

interface Props extends ButtonProps {
  color?: string;
  active?: boolean;
}

// NOTE: some of this is duplicated from NotebookCell.jsx
const ViewButton = ({ className, active, color, ...props }: Props) => (
  <Button
    className={cx(S.ViewButton, { [S.inactive]: !active }, className)}
    style={
      {
        "--view-button-color": color,
      } as CSSProperties
    }
    {...props}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ViewButton;
