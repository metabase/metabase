import React from "react";
import { Flex } from "grid-styled";

import Icon from "metabase/components/Icon";

const QueryDefinition = ({ question }) => (
  <Flex>
    {question.query().table() && (
      <span className="text-brand">
        {question.query().table().display_name}
      </span>
    )}
    {question.query().filters().length > 0 && (
      <span className="flex align-center">
        <span className="mx1">•</span>
        {/* todo - this should be changed to use the canonical color names */}
        <span className="text-purple">
          <Icon name="filter" size={20} />
        </span>
      </span>
    )}
  </Flex>
);

export default QueryDefinition;
