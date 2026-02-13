import { t } from "ttag";

import { Center, Flex, Stack, Text } from "metabase/ui";
import type {
  ReplaceSourceError,
  ReplaceSourceErrorType,
} from "metabase-types/api";

import { MAX_WIDTH } from "../constants";

import { ErrorDescription } from "./ErrorDescription";
import { ErrorTable } from "./ErrorTable";
import S from "./ModalBody.module.css";

type ModalBodyProps = {
  errors: ReplaceSourceError[];
  errorType: ReplaceSourceErrorType | undefined;
  isChecking: boolean;
  isChecked: boolean;
};

export function ModalBody({
  errors,
  errorType,
  isChecking,
  isChecked,
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
        <Stack w="100%" maw={MAX_WIDTH}>
          <ErrorDescription errorType={error.type} />
          <ErrorTable error={error} />
        </Stack>
      ) : (
        <Center flex={1}>
          <Text c="text-secondary">{getMessage(isChecking, isChecked)}</Text>
        </Center>
      )}
    </Flex>
  );
}

function getMessage(isChecking: boolean, isChecked: boolean) {
  if (isChecking) {
    return t`Checking data source compatibility…`;
  }

  if (isChecked) {
    return t`No compatibility issues found.`;
  }

  return t`Data source compatibility checks will be shown here.`;
}
