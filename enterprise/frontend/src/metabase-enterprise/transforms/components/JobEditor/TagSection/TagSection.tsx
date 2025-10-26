import { t } from "ttag";

import { Box } from "metabase/ui";
import type { TransformTagId } from "metabase-types/api";

import { TagMultiSelect } from "../../TagMultiSelect";
import { TitleSection } from "../../TitleSection";
import type { TransformJobInfo } from "../types";

type TagSectionProps = {
  job: TransformJobInfo;
  onTagsChange: (tagIds: TransformTagId[]) => void;
};

export function TagSection({ job, onTagsChange }: TagSectionProps) {
  return (
    <TitleSection
      label={t`Tags to run`}
      description={t`This job will run all transforms tagged with any of the tags you pick here.`}
    >
      <Box p="xl">
        <TagMultiSelect tagIds={job.tag_ids ?? []} onChange={onTagsChange} />
      </Box>
    </TitleSection>
  );
}
