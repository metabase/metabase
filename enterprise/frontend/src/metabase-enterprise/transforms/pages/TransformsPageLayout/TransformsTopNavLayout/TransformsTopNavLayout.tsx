import { Box, Flex } from "metabase/ui";

import { TransformsInnerNav } from "../TransformsInnerNav";

import S from "./TransformsTopNavLayout.module.css";

interface TransformsTopNavLayoutProps {
  children: React.ReactNode;
}

export const TransformsTopNavLayout = ({
  children,
}: TransformsTopNavLayoutProps) => {
  return (
    <Flex direction="column" w="100%" h="100%">
      <Box className={S.header}>
        <Box w={360} p="md">
          <TransformsInnerNav />
        </Box>
      </Box>
      <Box flex={1}>{children}</Box>
    </Flex>
  );
};
