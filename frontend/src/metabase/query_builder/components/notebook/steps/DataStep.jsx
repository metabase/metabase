import React from "react";

import { Box } from "grid-styled";

import QuestionDataSource from "../../view/QuestionDataSource";
import { ViewHeading } from "../../view/ViewSection";

export default function DataStep({ query }) {
  return (
    <Box mb={1}>
      <ViewHeading>
        <QuestionDataSource query={query} />
      </ViewHeading>
    </Box>
  );
}
