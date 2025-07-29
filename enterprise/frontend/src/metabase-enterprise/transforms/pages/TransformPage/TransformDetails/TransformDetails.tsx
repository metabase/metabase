import { Flex, Stack } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";

type TransformDetailsProps = {
  transform: Transform;
};

export function TransformDetails({ transform }: TransformDetailsProps) {
  return (
    <Flex direction="column" flex={1} align="center" p="xl">
      <Stack w="100%" maw="60rem" gap="5rem">
        <NameSection transform={transform} />
        <ManageSection transform={transform} />
      </Stack>
    </Flex>
  );
}
