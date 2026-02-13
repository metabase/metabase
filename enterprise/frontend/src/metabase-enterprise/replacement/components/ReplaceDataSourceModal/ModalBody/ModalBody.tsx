import { useMemo } from "react";

import { Flex, Stack } from "metabase/ui";
import type { ReplaceSourceError } from "metabase-types/api";

import { MAX_WIDTH } from "../constants";

import { MissingColumnErrorTable } from "./MissingColumnErrorTable";
import S from "./ModalBody.module.css";

type ModalBodyProps = {
  errors: ReplaceSourceError[];
};

export function ModalBody({ errors }: ModalBodyProps) {
  const missingColumnErrors = useMemo(
    () => errors.filter((error) => error.type === "missing-column"),
    [errors],
  );

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
        {missingColumnErrors.length > 0 && (
          <MissingColumnErrorTable errors={missingColumnErrors} />
        )}
      </Stack>
    </Flex>
  );
}
