import cx from "classnames";
import type { CSSProperties } from "react";

import { Button, type ButtonProps } from "metabase/common/components/Button";

import S from "./ViewButton.module.css";

interface Props extends ButtonProps {
  color?: string;
  active?: boolean;
}

// NOTE: some of this is duplicated from NotebookCell.jsx
export const ViewButton = ({ className, active, color, ...props }: Props) => {
  return (
    <Button
      classNames={{
        root: cx(S.ViewButton, { [S.active]: active }, className),
      }}
      style={
        {
          "--view-button-color": color ?? "var(--mb-color-brand)",
        } as CSSProperties
      }
      {...props}
    />
  );
};
