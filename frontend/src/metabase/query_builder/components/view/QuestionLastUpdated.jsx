import React from "react";

import moment from "moment";
import { t } from "ttag";

import { Flex } from "grid-styled";
import Icon from "metabase/components/Icon";

export default function QuestionLastUpdated({ result, ...props }) {
  return result ? (
    <Flex align="center" {...props}>
      <Icon name="clock" mr={1} />
      {t`Updated ${moment(result.updated_at).fromNow()}`}
    </Flex>
  ) : null;
}

QuestionLastUpdated.shouldRender = ({ result }) => result && result.cached;
