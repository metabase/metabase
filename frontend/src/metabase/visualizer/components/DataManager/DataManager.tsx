import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Center, Flex, Text } from "metabase/ui";
import { selectCards } from "metabase/visualizer/visualizer.slice";

import { DatasetList } from "./DatasetList";

export const DataManager = () => {
  const cards = useSelector(selectCards);

  return (
    <Flex
      direction="column"
      bg="white"
      style={{ borderRadius: "var(--default-border-radius)", height: "100%" }}
    >
      <Box px={12} py={8}>
        <Text fw="bold" mb={3}>
          {t`Data`}
        </Text>
      </Box>
      {cards.length > 0 ? (
        <DatasetList />
      ) : (
        <Center h="100%" w="100%" mx="auto">
          <Text>{t`Pick a dataset first`}</Text>
        </Center>
      )}
    </Flex>
  );
};
