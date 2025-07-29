import { Flex, Stack } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { TargetSection } from "./TargetSection";
import S from "./TransformDetails.module.css";

type TransformDetailsProps = {
  transform: Transform;
};

export function TransformDetails({ transform }: TransformDetailsProps) {
  return (
    <Flex
      className={S.root}
      w="100%"
      h="100%"
      direction="column"
      align="center"
      p="xl"
    >
      <Stack w="100%" maw="60rem" gap="5rem">
        <NameSection transform={transform} />
        <ManageSection transform={transform} />
        <TargetSection transform={transform} />
      </Stack>
    </Flex>
  );
}
