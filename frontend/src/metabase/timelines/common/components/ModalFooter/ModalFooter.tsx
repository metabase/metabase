import type { ReactNode } from "react";

import { FooterRoot } from "./ModalFooter.styled";

export interface ModalFooterProps {
  hasPadding?: boolean;
  children?: ReactNode;
}

const ModalFooter = ({
  hasPadding,
  children,
}: ModalFooterProps): JSX.Element => {
  return <FooterRoot hasPadding={hasPadding}>{children}</FooterRoot>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalFooter;
