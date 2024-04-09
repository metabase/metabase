import type { MouseEvent, ReactNode } from "react";

import { ArchiveButton } from "./FormDangerButton.styled";

export interface FormArchiveButtonProps {
  children?: ReactNode;
  onClick?: (event: MouseEvent) => void;
}

const FormArchiveButton = ({
  children,
  onClick,
}: FormArchiveButtonProps): JSX.Element => {
  return (
    <ArchiveButton type="button" borderless onClick={onClick}>
      {children}
    </ArchiveButton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormArchiveButton;
