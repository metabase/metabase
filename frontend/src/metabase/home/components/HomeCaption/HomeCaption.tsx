import type { ReactNode } from "react";

import { Flex, Text } from "metabase/ui";

interface HomeCaptionProps {
  primary?: boolean;
  children?: ReactNode;
}

export const HomeCaption = ({
  primary,
  children,
}: HomeCaptionProps): JSX.Element => {
  return (
    <Flex align="center" mb={{ base: "xl", xl: "xxl" }}>
      <Text
        component="span"
        fw={700}
        c={primary ? "text-primary" : "text-secondary"}
      >
        {children}
      </Text>
    </Flex>
  );
};
