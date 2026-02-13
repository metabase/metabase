import { t } from "ttag";

import { Box, Center, Flex, Text } from "metabase/ui";

import { MAX_WIDTH } from "../constants";
import type { TabInfo } from "../types";

import { DependentsTable } from "./DependentsTable";
import { ErrorsTable } from "./ErrorsTable";
import S from "./ModalBody.module.css";

type ModalBodyProps = {
  selectedTab: TabInfo | undefined;
};

export function ModalBody({ selectedTab }: ModalBodyProps) {
  return (
    <Flex
      className={S.body}
      p="lg"
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      {selectedTab != null ? (
        <Box w="100%" maw={MAX_WIDTH}>
          {selectedTab.type === "descendants" ? (
            <DependentsTable nodes={selectedTab.nodes} />
          ) : (
            <ErrorsTable error={selectedTab.error} />
          )}
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
