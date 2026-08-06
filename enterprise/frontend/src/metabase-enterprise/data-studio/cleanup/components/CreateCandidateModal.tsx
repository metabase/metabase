import { useState } from "react";
import { t } from "ttag";

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

import { useCandidateAction } from "../hooks/useCandidateAction";

import { CandidateDefinition } from "./CandidateDefinition";

type CreateCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onCreated: (type: UsageMetadataCandidateType, id: number) => void;
  onStale: () => void;
};

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
  const runCandidateAction = useCandidateAction();

  const handleCreate = async () => {
    await runCandidateAction({
      action: "create",
      candidate,
      request: () =>
        createCandidate({
          id: candidate.id,
          name,
          description,
        }).unwrap(),
      errorMessage: t`The Library entity could not be created`,
      onStale,
      onSuccess: (response) => {
        onCreated(candidate.candidate_type, response.entity.id);
      },
    });
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
