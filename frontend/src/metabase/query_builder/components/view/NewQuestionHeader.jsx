import { t } from "ttag";

import { color } from "metabase/lib/colors";

import ViewSection, { ViewHeading } from "./ViewSection";

export default function NewQuestionHeader(props) {
  return (
    <ViewSection
      {...props}
      style={{ borderBottom: `1px solid ${color("border")}` }}
    >
      <ViewHeading>{t`Pick your starting data`}</ViewHeading>
    </ViewSection>
  );
}
