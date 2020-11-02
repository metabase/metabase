import React from "react";
import { Box } from "grid-styled";

import Heading from "metabase/components/type/Heading";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";

import ProgressBar from "metabase/components/ProgressBar";

import { stats } from "../lib/components-webpack";

const WelcomePage = () => {
  return (
    <Box className="wrapper wrapper--trim">
      <Box my={4}>
        <Heading>Metabase Style Guide</Heading>
        <Text>
          Reference and samples for how to make things the Metabase way.
        </Text>
      </Box>

      <Subhead>Documentation progress</Subhead>
      <Text>
        Documenting our component library is an ongoing process. Here's what
        percentage of the code in <code>metabase/components</code> has some form
        of documentation so far.
      </Text>

      <Box mt={3}>
        <ProgressBar percentage={stats.ratio * 0.01} />
      </Box>
    </Box>
  );
};

export default WelcomePage;
