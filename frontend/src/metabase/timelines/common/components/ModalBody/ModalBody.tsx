import { BodyRoot } from "./ModalBody.styled";

export interface ModalBodyProps {
  children?: React.ReactNode;
}

const ModalBody = ({ children }: ModalBodyProps): JSX.Element => {
  return <BodyRoot>{children}</BodyRoot>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalBody;
