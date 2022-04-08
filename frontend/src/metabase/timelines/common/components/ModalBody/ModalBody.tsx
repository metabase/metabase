import React, { ReactNode } from "react";
import { BodyRoot } from "./ModalBody.styled";

export interface ModalBodyProps {
  children?: ReactNode;
}

const ModalBody = ({ children }: ModalBodyProps): JSX.Element => {
  return <BodyRoot>{children}</BodyRoot>;
};

export default ModalBody;
