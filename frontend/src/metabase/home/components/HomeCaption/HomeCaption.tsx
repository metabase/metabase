import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

interface HomeCaptionProps {
  primary?: boolean;
  children?: ReactNode;
}

export const HomeCaption = ({
  primary,
  children,
}: HomeCaptionProps): JSX.Element => {
  return (
    <Flex
      align="center"
      c={primary ? "text-primary" : "text-secondary"}
      fw="bold"
      mb={{ base: "xl", xl: "xxl" }}
    >
      {children}
    </Flex>
  );
};
