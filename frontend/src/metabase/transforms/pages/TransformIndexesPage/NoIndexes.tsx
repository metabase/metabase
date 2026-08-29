import { t } from "ttag";

import { Flex, Text } from "metabase/ui";

import TransformIndexesEmpty from "./assets/transform-indexes-empty.svg?component";

export function NoIndexes() {
  return (
    <Flex gap="md" direction="column" justify="center" align="center" mih={360}>
      <TransformIndexesEmpty aria-hidden />
      <Text
        c="text-secondary"
        maw={360}
        ta="center"
      >{t`Index the key columns of your transforms to make them faster and more efficient.`}</Text>
    </Flex>
  );
}
