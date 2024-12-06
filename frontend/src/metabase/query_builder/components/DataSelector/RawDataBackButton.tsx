import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon } from "metabase/ui";

import DataSelectorS from "./DataSelector.module.css";

export function RawDataBackButton() {
  return (
    <Flex align="center" className={CS.cursorPointer}>
      <Icon name="chevronleft" size={16} />
      <Box
        component="span"
        className={DataSelectorS.BackButtonLabel}
      >{t`Raw Data`}</Box>
    </Flex>
  );
}
