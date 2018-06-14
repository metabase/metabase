import React from "react";
import { Box, Flex } from "grid-styled";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import UserAvatar from "metabase/components/UserAvatar";

const EntityInfo = ({ entity }) => (
  <Box>
    <Box my={4}>
      <h1>
        {entity.displayName() || "Good title"}
        {entity.query().segments().length > 0 && <span> filtered by</span>}
        {entity
          .query()
          .segments()
          .map(s => (
            <div className="inline-block">
              <Tooltip tooltip={s.description}>
                <span className="bg-purple text-white p2 rounded flex align-center">
                  {s.name}
                  <Link
                    to={entity
                      .query()
                      .removeFilter(0)
                      .question()
                      .getUrl()}
                  >
                    <Icon name="close" className="ml1" />
                  </Link>
                </span>
              </Tooltip>
            </div>
          ))}
      </h1>
      <p>{entity.card().description}</p>

      {entity.card().creator && (
        <Flex align="center">
          <UserAvatar user={entity.card().creator} />
          {entity.card().creator.common_name} created this question
        </Flex>
      )}
    </Box>
    <Box my={4}>
      <div className="bordered rounded shadowed p3">
        <h2>{entity.query().table().display_name}</h2>
        <p>{entity.query().table().description}</p>
      </div>
    </Box>
    <Box>
      <Box my={2}>
        <h3>What's interesting about this</h3>
        <p className="text-paragraph text-measure">
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
      <Box my={2}>
        <h3>Things to know about this</h3>
        <p className="text-paragraph text-measure">
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
      <Box my={2}>
        <h3>How is this calculated?</h3>
        <p className="text-paragraph text-measure">
          There is some weirdness in how you have to filter this table in order
          to get the metric you want. Also note that instances check in twice
          per day, so if you do a count of rows to determine active instances,
          make sure to divide it by 2
        </p>
      </Box>
    </Box>
  </Box>
);

export default EntityInfo;
