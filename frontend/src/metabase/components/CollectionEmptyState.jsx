import React from "react";
import { Box } from "grid-styled";
import { t } from "c-3po";
import RetinaImage from "react-retina-image";
import Subhead from "metabase/components/Subhead";

import { normal } from "metabase/lib/colors";

const CollectionEmptyState = () => {
  return (
    <Box py={2}>
      <Box mb={3}>
        <RetinaImage
          src="app/img/collection-empty-state.png"
          className="block ml-auto mr-auto"
        />
      </Box>
      <Box className="text-centered">
        <Subhead color={normal.grey2}>
          {t`This collection is empty, like a blank canvas`}
        </Subhead>
        <p className="text-paragraph text-grey-2">
          {t`You can use collections to organize and group dashboards, questions and pulses for your team or yourself`}
        </p>
      </Box>
    </Box>
  );
};

export default CollectionEmptyState;
