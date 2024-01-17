/* eslint-disable react/prop-types */
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import { SectionRoot } from "./QuestionLastUpdated.styled";

export default function QuestionLastUpdated({ result, ...props }) {
  return result ? (
    <SectionRoot {...props}>
      <Icon name="clock" className="mr1" />
      {t`Updated ${moment(result.updated_at).fromNow()}`}
    </SectionRoot>
  ) : null;
}

QuestionLastUpdated.shouldRender = ({ result }) => result && result.cached;
