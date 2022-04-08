import React, { ReactNode } from "react";
import { FooterRoot } from "./ModalFooter.styled";

export interface ModalFooterProps {
  children?: ReactNode;
}

const ModalFooter = ({ children }: ModalFooterProps): JSX.Element => {
  return <FooterRoot>{children}</FooterRoot>;
};

export default ModalFooter;
