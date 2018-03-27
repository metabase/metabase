import React from "react";
import { Box, Subhead } from "rebass";
import { Link } from 'react-router'

import SegmentListLoader from "metabase/components/SegmentListLoader";

const SegmentList = () => {
  return (
    <SegmentListLoader>
      {({ segments, loading, error }) => {
        if(loading) {
          return <Box>Loading...</Box>
        }
        return (
          <Box>
            <Subhead>Segments</Subhead>
            {segments.map(segment =>
              <Box>
                <Link to=''>{segment.name}</Link>
              </Box>
            )}
          </Box>
        )
      }}
    </SegmentListLoader>
  );
};

export default SegmentList;
