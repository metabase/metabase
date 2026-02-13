import { t } from "ttag";

import { Box, Flex, SimpleGrid } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { MAX_WIDTH } from "../constants";

import S from "./ModalHeader.module.css";
import { SourceSelect } from "./SourceSelect";

type ModalHeaderProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
};

export function ModalHeader({ source, target }: ModalHeaderProps) {
  return (
    <Flex className={S.header} p="lg" direction="column" align="center">
      <Box w="100%" maw={MAX_WIDTH}>
        <SimpleGrid cols={2}>
          <SourceSelect
            entry={source}
            label={t`Find all occurrences of this data source`}
            description={t`We'll look for every query in your instance that uses this data source.`}
          />
          <SourceSelect
            entry={target}
            label={t`Replace it with this data source`}
            description={t`This data source will be used in every matching query instead.`}
          />
        </SimpleGrid>
      </Box>
    </Flex>
  );
}
