import React from "react";
import { Box } from "grid-styled";
import { Text, Subhead } from "rebass";
import { t } from "c-3po";

import { normal } from "metabase/lib/colors";

const CollectionEmptyState = () => {
  return (
    <Box py={2}>
      <Box mb={3}>
        <img
          src="/app/assets/img/collection-empty-state.svg"
          width={200}
          height={200}
          className="ml-auto mr-auto block"
        />
      </Box>
      <Box className="text-centered">
        <Subhead color={normal.grey2}>
          {t`This collection is empty, like a blank canvas`}
        </Subhead>
        <Text color={normal.grey2}>
          {t`You can use collections to organize and group dashboards, questions and pulses for your team or yourself`}
        </Text>
      </Box>
    </Box>
  );
};

export default CollectionEmptyState;
