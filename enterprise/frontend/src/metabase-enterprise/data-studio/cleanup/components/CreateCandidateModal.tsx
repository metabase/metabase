import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormProvider,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useCreateUsageMetadataCandidateMutation } from "metabase-enterprise/api";
import type {
  UsageMetadataCandidateDetail,
  UsageMetadataCandidateType,
} from "metabase-types/api";

import {
  CANDIDATE_DESCRIPTION_MAX_LENGTH,
  CANDIDATE_NAME_MAX_LENGTH,
} from "../constants";
import { useCandidateAction } from "../hooks/useCandidateAction";

import { CandidateDefinition } from "./CandidateDefinition";

type CreateCandidateModalProps = {
  candidate: UsageMetadataCandidateDetail;
  opened: boolean;
  onClose: () => void;
  onCreated: (type: UsageMetadataCandidateType, id: number) => void;
  onStale: () => void;
};

type CreateCandidateFormValues = {
  name: string;
  description: string;
};

const CREATE_CANDIDATE_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(CANDIDATE_NAME_MAX_LENGTH, Errors.maxLength),
  description: Yup.string().max(
    CANDIDATE_DESCRIPTION_MAX_LENGTH,
    Errors.maxLength,
  ),
});

export function CreateCandidateModal({
  candidate,
  opened,
  onClose,
  onCreated,
  onStale,
}: CreateCandidateModalProps) {
  const [createCandidate, { isLoading }] =
    useCreateUsageMetadataCandidateMutation();
  const runCandidateAction = useCandidateAction();

  const handleCreate = async ({
    name,
    description,
  }: CreateCandidateFormValues) => {
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
        onCreated(candidate.candidate_type, response.id);
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
      <FormProvider<CreateCandidateFormValues, unknown>
        initialValues={{
          name: candidate.suggested_name,
          description: candidate.suggested_description ?? "",
        }}
        validationSchema={CREATE_CANDIDATE_SCHEMA}
        onSubmit={handleCreate}
      >
        <Form>
          <Stack>
            <Text size="sm" c="text-secondary">
              {t`The mined definition is read-only. You can review it and customize its name and description.`}
            </Text>
            <FormTextInput
              name="name"
              label={t`Name`}
              required
              maxLength={CANDIDATE_NAME_MAX_LENGTH}
            />
            <FormTextarea
              name="description"
              label={t`Description`}
              autosize
              minRows={3}
              maxLength={CANDIDATE_DESCRIPTION_MAX_LENGTH}
            />
            <Stack gap="xs">
              <Text fw="bold">{t`Definition`}</Text>
              <CandidateDefinition candidate={candidate} />
            </Stack>
            <Group justify="flex-end">
              <Button type="button" variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button type="submit" loading={isLoading}>
                {candidate.candidate_type === "measure"
                  ? t`Create Measure`
                  : t`Create Segment`}
              </Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    </Modal>
  );
}
