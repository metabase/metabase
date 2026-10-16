import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

export interface ModalFooterProps {
  hasPadding?: boolean;
  children?: ReactNode;
}

export const ModalFooter = ({
  hasPadding,
  children,
}: ModalFooterProps): JSX.Element => {
  return (
    <Flex
      gap="lg"
      justify="flex-end"
      pt={hasPadding ? "xxl" : 0}
      px="xxl"
      pb="xxl"
    >
      {children}
    </Flex>
  );
};
