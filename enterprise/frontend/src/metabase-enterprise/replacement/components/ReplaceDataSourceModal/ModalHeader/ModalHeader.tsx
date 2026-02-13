import { t } from "ttag";

import {
  Box,
  Flex,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type {
  ReplaceSourceEntry,
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { MAX_WIDTH } from "../constants";

import { ErrorTypeTabs } from "./ErrorTypeTabs";
import S from "./ModalHeader.module.css";
import { SourceSelect } from "./SourceSelect";

type ModalHeaderProps = {
  source: ReplaceSourceEntry | undefined;
  target: ReplaceSourceEntry | undefined;
  errors: ReplaceSourceError[];
  errorType: ReplaceSourceErrorType | undefined;
  onErrorTypeChange: (errorType: ReplaceSourceErrorType) => void;
};

export function ModalHeader({
  source,
  target,
  errors,
  errorType,
  onErrorTypeChange,
}: ModalHeaderProps) {
  const hasErrors = errors.length > 0;

  return (
    <Flex
      className={S.header}
      px="lg"
      pt="lg"
      pb={hasErrors ? 0 : "lg"}
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
        <SimpleGrid cols={2} mb="md">
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
        {hasErrors && (
          <ErrorTypeTabs
            errors={errors}
            errorType={errorType}
            onErrorTypeChange={onErrorTypeChange}
          />
        )}
      </Box>
    </Flex>
  );
}
