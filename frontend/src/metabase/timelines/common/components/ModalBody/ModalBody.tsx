import type { ReactNode } from "react";

import S from "./ModalBody.module.css";

export interface ModalBodyProps {
  children?: ReactNode;
}

const ModalBody = ({ children }: ModalBodyProps): JSX.Element => {
  return <div className={S.BodyRoot}>{children}</div>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalBody;
