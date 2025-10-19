import { t } from "ttag";

import { Box } from "metabase/ui";
import type { TransformTagId } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";
import type { TransformJobInfo } from "../types";

type TagSectionProps = {
  job: TransformJobInfo;
  onTagsChange: (tagIds: TransformTagId[]) => void;
};

export function TagSection({ job, onTagsChange }: TagSectionProps) {
  return (
    <SplitSection
      label={t`Tags to run`}
      description={t`This job will run all transforms tagged with any of the tags you pick here.`}
    >
      <Box p="xl">
        <TagMultiSelect tagIds={job.tag_ids ?? []} onChange={onTagsChange} />
      </Box>
    </SplitSection>
  );
}
