import { t } from "ttag";

import { Box, Flex, Group, Modal, Stack, Text, Title } from "metabase/ui";
import type { ReplaceSourceEntry } from "metabase-types/api";

import { MAX_WIDTH } from "../constants";
import type { TabInfo, TabType } from "../types";

import { EntitySelect } from "./EntrySelect";
import { ErrorTypeTabs } from "./ErrorTypeTabs";
import S from "./ModalHeader.module.css";

type ModalHeaderProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
  tabs: TabInfo[];
  selectedTabType: TabType | undefined;
  onSourceChange: (source: ReplaceSourceEntry) => void;
  onTargetChange: (target: ReplaceSourceEntry) => void;
  onTabChange: (tabType: TabType) => void;
};

export function ModalHeader({
  source,
  target,
  tabs,
  selectedTabType,
  onSourceChange,
  onTargetChange,
  onTabChange,
}: ModalHeaderProps) {
  const hasTabs = tabs.length > 0;

  return (
    <Flex
      className={S.header}
      px="lg"
      pt="lg"
      pb={hasTabs ? 0 : "lg"}
      direction="column"
      align="center"
    >
      <Box w="100%" maw={MAX_WIDTH}>
        <Stack gap="sm" mb="lg">
          <Group justify="space-between" wrap="nowrap">
            <Title order={2}>{t`Find and replace a data source`}</Title>
            <Modal.CloseButton />
          </Group>
          <Text>
            {t`This lets you change the data source used in queries in bulk.`}
          </Text>
        </Stack>
        <Group gap="lg">
          <Box flex={1}>
            <EntitySelect
              entry={source}
              label={t`Find all occurrences of this data source`}
              description={t`We'll look for every query in your instance that uses this data source.`}
              placeholder={t`Pick a table, model, or saved question that you want to replace`}
              onChange={onSourceChange}
            />
          </Box>
          <Box flex={1}>
            <EntitySelect
              entry={target}
              label={t`Replace it with this data source`}
              description={t`This data source will be used in every matching query instead.`}
              placeholder={t`Pick a matching table, model, or saved question from the same database`}
              onChange={onTargetChange}
            />
          </Box>
        </Group>
        {hasTabs && (
          <ErrorTypeTabs
            tabs={tabs}
            selectedTabType={selectedTabType}
            onTabChange={onTabChange}
          />
        )}
      </Box>
    </Flex>
  );
}
