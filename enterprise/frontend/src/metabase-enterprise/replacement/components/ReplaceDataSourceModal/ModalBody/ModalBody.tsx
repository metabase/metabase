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
  isSameSource: boolean;
};

export function ModalBody({
  errors,
  errorType,
  isChecking,
  isChecked,
  isSameSource,
}: ModalBodyProps) {
  const error = errors.find((error) => error.type === errorType);

  return (
    <Flex
      className={S.body}
      p="lg"
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      {error != null ? (
        <Box w="100%" maw={MAX_WIDTH}>
          <ErrorTable error={error} />
        </Box>
      ) : (
        <Center flex={1}>
          <Text c="text-secondary">
            {getInfoMessage(isChecking, isChecked, isSameSource)}
          </Text>
        </Center>
      )}
    </Flex>
  );
}

function getInfoMessage(
  isChecking: boolean,
  isChecked: boolean,
  isSameSource: boolean,
) {
  if (isSameSource) {
    return t`The new data source is the same as the original.`;
  }

  if (isChecking) {
    return t`Checking data source compatibility…`;
  }

  if (isChecked) {
    return t`No compatibility issues found.`;
  }

  return t`Data source compatibility checks will be shown here.`;
}
