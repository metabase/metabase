import { t } from "ttag";

import { SplitSection } from "../../../components/SplitSection";
import { TagListInput } from "../../../components/TagListInput";

export function TagSection() {
  return (
    <SplitSection
      label={t`Tags to run`}
      description={t`This job will run all transforms tagged with the tags you pick here.`}
    >
      <TagListInput />
    </SplitSection>
  );
}
