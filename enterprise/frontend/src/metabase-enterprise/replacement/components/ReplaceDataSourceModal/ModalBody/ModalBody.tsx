import { Flex, Stack } from "metabase/ui";

import S from "./ModalBody.module.css";

export function ModalBody() {
  return (
    <Flex
      className={S.body}
      flex={1}
      direction="column"
      align="center"
      bg="background-secondary"
    >
      <Stack />
    </Flex>
  );
}
