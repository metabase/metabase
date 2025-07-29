import { Flex, Stack } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { TransformNameSection } from "./TransfomNameSection";

type TransformDetailsProps = {
  transform: Transform;
};

export function TransformDetails({ transform }: TransformDetailsProps) {
  return (
    <Flex direction="column" flex={1} align="center" p="xl">
      <Stack w="100%" maw="60rem">
        <TransformNameSection transform={transform} />
      </Stack>
    </Flex>
  );
}
