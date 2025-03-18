import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Center, Flex, Text } from "metabase/ui";
import { getDataSources } from "metabase/visualizer/selectors";

import { DatasetList } from "./DatasetList";

export const DataManager = () => {
  const dataSources = useSelector(getDataSources);

  return (
    <Flex
      direction="column"
      bg="white"
      style={{
        borderRadius: "var(--default-border-radius)",
        height: "100%",
        border: `1px solid var(--mb-color-border)`,
      }}
    >
      {dataSources.length > 0 ? (
        <DatasetList />
      ) : (
        <Center h="100%" w="100%" mx="auto">
          <Text>{t`Pick a dataset first`}</Text>
        </Center>
      )}
    </Flex>
  );
};
