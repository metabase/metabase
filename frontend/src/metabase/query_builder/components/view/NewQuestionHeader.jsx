import { t } from "ttag";

import ViewSection, { ViewHeading } from "./ViewSection";

export default function NewQuestionHeader(props) {
  return (
    <ViewSection
      {...props}
      style={{ borderBottom: "1px solid var(--mb-color-border)" }}
    >
      <ViewHeading>{t`Pick your starting data`}</ViewHeading>
    </ViewSection>
  );
}
