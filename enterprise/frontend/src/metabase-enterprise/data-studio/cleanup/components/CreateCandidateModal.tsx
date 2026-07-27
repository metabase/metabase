import { useState } from "react";
import { t } from "ttag";

import { trackDataStudioCleanupCandidateAction } from "metabase/common/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "metabase/ui";
import { useCreateUsageMetadataCandidateMutation } from "metabase-enterprise/api";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateType,
} from "metabase-types/api";

import { CandidateDefinition } from "./CandidateDefinition";

type CreateCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onCreated: (type: UsageMetadataCandidateType, id: number) => void;
  onStale: () => void;
};

function getErrorStatus(error: unknown) {
  return typeof error === "object" && error != null && "status" in error
    ? error.status
    : undefined;
}

export function CreateCandidateModal({
  candidate,
  opened,
  onClose,
  onCreated,
  onStale,
}: CreateCandidateModalProps) {
  const [name, setName] = useState(candidate.suggested_name);
  const [description, setDescription] = useState(
    candidate.suggested_description ?? "",
  );
  const [createCandidate, { isLoading }] =
    useCreateUsageMetadataCandidateMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleCreate = async () => {
    try {
      const response = await createCandidate({
        id: candidate.id,
        name,
        description,
      }).unwrap();
      trackDataStudioCleanupCandidateAction({
        action: "create",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "success",
      });
      onCreated(candidate.candidate_type, response.entity.id);
    } catch (error) {
      trackDataStudioCleanupCandidateAction({
        action: "create",
        candidateId: candidate.id,
        candidateType: candidate.candidate_type,
        result: "failure",
      });
      if (getErrorStatus(error) === 409) {
        onStale();
      } else {
        sendErrorToast(t`The Library entity could not be created`);
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        candidate.candidate_type === "measure"
          ? t`Create Measure`
          : t`Create Segment`
      }
    >
      <Stack>
        <Text size="sm" c="text-secondary">
          {t`The mined definition is read-only. You can review it and customize its name and description.`}
        </Text>
        <TextInput
          label={t`Name`}
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          label={t`Description`}
          value={description}
          autosize
          minRows={3}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <Stack gap="xs">
          <Text fw="bold">{t`Definition`}</Text>
          <CandidateDefinition candidate={candidate} />
        </Stack>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
          <Button
            loading={isLoading}
            disabled={!name.trim()}
            onClick={handleCreate}
          >
            {candidate.candidate_type === "measure"
              ? t`Create Measure`
              : t`Create Segment`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
