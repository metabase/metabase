/* eslint-disable react/prop-types */
import React from "react";

import moment from "moment-timezone";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import { SectionRoot } from "./QuestionLastUpdated.styled";

export default function QuestionLastUpdated({ result, ...props }) {
  return result ? (
    <SectionRoot {...props}>
      <Icon name="clock" mr={1} />
      {t`Updated ${moment(result.updated_at).fromNow()}`}
    </SectionRoot>
  ) : null;
}

QuestionLastUpdated.shouldRender = ({ result }) => result && result.cached;
