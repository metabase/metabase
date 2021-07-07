import React from "react";
import { Box, Flex } from "grid-styled";

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
        Documenting our component library is an ongoing process. Here&apos;s
        what percentage of the code in <code>metabase/components</code> has some
        form of documentation so far.
      </Text>

      <Box mt={3}>
        <ProgressBar percentage={stats.ratio} />
        <Flex align="center" mt={1}>
          <Box>
            <Subhead>{stats.documented}</Subhead>
            <Text>Documented</Text>
          </Box>
          <Box ml={"auto"} className="text-right">
            <Subhead>{stats.total}</Subhead>
            <Text>Total .jsx files in /components</Text>
          </Box>
        </Flex>
      </Box>
    </Box>
  );
};

export default WelcomePage;
