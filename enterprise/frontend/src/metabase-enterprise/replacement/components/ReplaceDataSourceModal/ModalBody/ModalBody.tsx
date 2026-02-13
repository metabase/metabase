import { t } from "ttag";

import { Box, Center, Flex, Text } from "metabase/ui";

import { MAX_WIDTH } from "../constants";
import type { TabInfo } from "../types";

import { ErrorTable } from "./ErrorTable";
import S from "./ModalBody.module.css";

type ModalBodyProps = {
  tab: TabInfo;
};

export function ModalBody({ tab }: ModalBodyProps) {
  return (
    <Flex
      className={S.body}
      p="lg"
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      {tab != null ? (
        <Box w="100%" maw={MAX_WIDTH}>
          {tab.type === "descendant" ? null : <ErrorTable error={tab.error} />}
        </Box>
      ) : (
        <Center flex={1}>
          <Text c="text-secondary">
            {t`The items that will be affected will show up here.`}
          </Text>
        </Center>
      )}
    </Flex>
  );
}
