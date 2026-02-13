import { t } from "ttag";

import { Box, Center, Flex, Text } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { MAX_WIDTH } from "../constants";

import { ErrorTable } from "./ErrorTable";
import S from "./ModalBody.module.css";

type ModalBodyProps = {
  errors: ReplaceSourceError[];
  errorType: ReplaceSourceErrorType | undefined;
  isChecking: boolean;
  isChecked: boolean;
};

export function ModalBody(props: ModalBodyProps) {
  return (
    <Flex
      className={S.body}
      p="lg"
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      {getContent(props)}
    </Flex>
  );
}

function getContent({
  errors,
  errorType,
  isChecking,
  isChecked,
}: ModalBodyProps) {
  if (isChecking) {
    return (
      <Center>
        <Text c="text-secondary">{t`Checking data source compatibility…`}</Text>
      </Center>
    );
  }

  if (errorType != null) {
    <Box w="100%" maw={MAX_WIDTH}>
      <ErrorTable errors={errors} errorType={errorType} />
    </Box>;
  }

  if (isChecked) {
    return (
      <Center>
        <Text c="text-secondary">{t`No compatibility issues found.`}</Text>
      </Center>
    );
  }

  return null;
}
