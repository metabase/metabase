/* eslint-disable react/prop-types */
import moment from "moment-timezone";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
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
