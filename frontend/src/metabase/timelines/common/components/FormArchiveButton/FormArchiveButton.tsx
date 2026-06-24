import type { MouseEvent, ReactNode } from "react";

import { Button } from "metabase/ui";

import S from "./FormArchiveButton.module.css";

export interface FormArchiveButtonProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

const FormArchiveButton = ({
  children,
  onClick,
}: FormArchiveButtonProps): JSX.Element => {
  return (
    <Button
      className={S.archiveButton}
      type="button"
      variant="subtle"
      color="danger"
      px={0}
      onClick={onClick}
    >
      {children}
    </Button>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormArchiveButton;
