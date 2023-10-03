import { t } from "ttag";
import { Box, Button, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "./types";
import { BackButton } from "./BackButton";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function StringFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;
  return (
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
      </Header>
      <Flex p="sm">
        <Text>String editor UI</Text>
      </Flex>
      <Footer>
        <Box />
        <Button>{filter ? t`Update filter` : t`Add filter`}</Button>
      </Footer>
    </>
  );
}
