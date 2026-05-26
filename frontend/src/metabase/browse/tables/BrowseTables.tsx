import { Flex } from "metabase/ui";

import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";

import { TableBrowser } from "./TableBrowser";

export const BrowseTables = ({
  params: { dbId, schemaName },
}: {
  params: {
    dbId: string;
    schemaName: string;
  };
}) => {
  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="md"
    >
      <BrowseDataHeader />
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%" direction="column">
          <TableBrowser dbId={dbId} schemaName={schemaName} />
        </Flex>
      </Flex>
    </Flex>
  );
};
