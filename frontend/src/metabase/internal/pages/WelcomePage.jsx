import React from "react";

import Heading from "metabase/components/type/Heading";
import Text from "metabase/components/type/Text";

const WelcomePage = () => {
  return (
    <div className="wrapper wrapper--trim">
      <div className="my4">
        <Heading>Metabase Style Guide</Heading>
        <Text>
          Reference and samples for how to make things the Metabase way.
        </Text>
      </div>
    </div>
  );
};

export default WelcomePage;
