import React from "react";
import { Box } from "rebass";

import RecentViews from "metabase/home/components/RecentViews";
import Favorites from "metabase/components/Favorites";

class GlobalLanding extends React.Component {
  render() {
    return (
      <Box w="100%">
        <RecentViews />
        <Favorites />
      </Box>
    );
  }
}

export default GlobalLanding;
