import { Flex, Stack } from "metabase/ui";
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
};

export function ModalBody({ errors, errorType }: ModalBodyProps) {
  return (
    <Flex
      className={S.body}
      p="lg"
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      <Stack w="100%" maw={MAX_WIDTH}>
        {errorType != null && (
          <ErrorTable errors={errors} errorType={errorType} />
        )}
      </Stack>
    </Flex>
  );
}
