import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box } from "metabase/ui";
import { useUpdateTransformJobMutation } from "metabase-enterprise/api";
import type { TransformJob, TransformTagId } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import { TagMultiSelect } from "../../../components/TagMultiSelect";

type TagSectionProps = {
  job: TransformJob;
};

export function TagSection({ job }: TagSectionProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleTagListChange = async (tagIds: TransformTagId[]) => {
    const { error } = await updateJob({
      id: job.id,
      tag_ids: tagIds,
    });

    if (error) {
      sendErrorToast(t`Failed to update job tags`);
    } else {
      sendSuccessToast(t`Job tags updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          tag_ids: job.tag_ids,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <SplitSection
      label={t`Tags to run`}
      description={t`This job will run all transforms tagged with the tags you pick here.`}
    >
      <Box p="xl">
        <TagMultiSelect
          tagIds={job.tag_ids ?? []}
          onChange={handleTagListChange}
        />
      </Box>
    </SplitSection>
  );
}
