import React from "react";

import { Box, Heading } from "rebass";
import { PageLayout } from "./EntityLayout";

const EntityInfo = ({ entity }) => (
  <PageLayout>
    <Box my={4}>
      <Heading>{entity.displayName() || "Good title" }</Heading>
      <p>{entity.card().description}</p>
    </Box>
    <Box my={4}>
      <div className="bordered rounded shadowed p3">
        <h2>{ entity.query().table().display_name }</h2>
        <p>{ entity.query().table().description }</p>
      </div>
    </Box>
    <Box>
      <Box my={2}>
        <h3>What's interesting about this</h3>
        <p>
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
      <Box my={2}>
        <h3>Things to know about this</h3>
        <p>
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
      <Box my={2}>
        <h3>How is this calculated?</h3>
        <p>
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
    </Box>
  </PageLayout>
);

export default EntityInfo;
