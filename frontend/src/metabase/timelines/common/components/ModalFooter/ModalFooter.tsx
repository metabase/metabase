import React, { ReactNode } from "react";
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

export default ModalFooter;
