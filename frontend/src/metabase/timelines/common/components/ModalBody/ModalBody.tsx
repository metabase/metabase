import type { ReactNode } from "react";

import { Box } from "metabase/ui";
export interface ModalBodyProps {
  children?: ReactNode;
}

const ModalBody = ({ children }: ModalBodyProps): JSX.Element => {
  return <Box p="2rem">{children}</Box>;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalBody;
