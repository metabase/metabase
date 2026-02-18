import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Flex, Icon, Modal, Text, Title } from "metabase/ui";
import { useGetWorkspaceProblemsQuery } from "metabase-enterprise/api";
import type {
  WorkspaceId,
  WorkspaceTransformListItem,
} from "metabase-types/api";

import S from "./MergeWorkspaceModal.module.css";
import { DiffView } from "./components/DiffView";
import { OverviewPanel } from "./components/OverviewPanel";
import { TransformListItem } from "./components/TransformListItem";

type MergeWorkspaceModalProps = {
  onClose: VoidFunction;
  onSubmit: (commitMessage: string) => Promise<void>;
  isLoading?: boolean;
  isDisabled?: boolean;
  workspaceId: WorkspaceId;
  workspaceName: string;
  workspaceTransforms: WorkspaceTransformListItem[];
};

export type MergeWorkspaceFormValues = {
  commit_message: string;
};

export const initialFormValues: MergeWorkspaceFormValues = {
  commit_message: "",
};
export const MAX_COMMIT_MESSAGE_LENGTH = 255;

const getMergeWorkspaceSchema = () =>
  Yup.object().shape({
    commit_message: Yup.string()
      .trim()
      .max(MAX_COMMIT_MESSAGE_LENGTH, t`Commit message is too long.`)
      .required(t`Please provide a commit message.`),
  });

export const MergeWorkspaceModal = ({
  onClose,
  onSubmit,
  isLoading = false,
  isDisabled = false,
  workspaceId,
  workspaceName,
  workspaceTransforms,
}: MergeWorkspaceModalProps) => {
  const { sendErrorToast } = useMetadataToasts();
  const validationSchema = useMemo(() => getMergeWorkspaceSchema(), []);

  const {
    data: workspaceProblems = [],
    isFetching: isLoadingWorkspaceProblems,
  } = useGetWorkspaceProblemsQuery(workspaceId);
  const hasBlockingProblems = useMemo(
    () => workspaceProblems.some((p) => p.block_merge === true),
    [workspaceProblems],
  );

  const updatedTransforms = useMemo(
    () => workspaceTransforms.filter((t) => t.global_id != null),
    [workspaceTransforms],
  );

  const newTransforms = useMemo(
    () => workspaceTransforms.filter((t) => t.global_id == null),
    [workspaceTransforms],
  );

  const [selectedTransformId, setSelectedTransformId] = useState<
    string | "overview"
  >("overview");

  const selectedTransform =
    selectedTransformId !== "overview"
      ? workspaceTransforms.find((t) => t.ref_id === selectedTransformId)
      : null;

  const handleSubmit = async (values: MergeWorkspaceFormValues) => {
    try {
      await onSubmit(values.commit_message.trim());
      onClose();
    } catch (error) {
      sendErrorToast(t`Failed to merge workspace`);
      throw error;
    }
  };

  return (
    <Modal
      data-testid="review-changes-modal"
      onClose={onClose}
      opened
      title={
        <Flex align="center" gap="sm">
          <Icon name="git_branch" c="brand" />
          <Flex direction="column" gap="xs">
            <Title order={3}>{t`Review Changes`}</Title>
            <Text size="sm" c="text-secondary">
              {workspaceName}
            </Text>
          </Flex>
        </Flex>
      }
      size="xl"
      padding={0}
      styles={{
        header: {
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--mb-color-border)",
        },
      }}
    >
      <FormProvider
        initialValues={initialFormValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, touched, errors }) => (
          <Form style={{ display: "flex", flexDirection: "column" }}>
            <Flex h={540}>
              <Box
                pt="md"
                w={220}
                miw={220}
                style={{
                  borderRight: "1px solid var(--mb-color-border)",
                  overflowY: "auto",
                }}
              >
                <Flex
                  align="center"
                  gap="sm"
                  px="md"
                  py="sm"
                  className={cx(
                    S.sidebarItem,
                    selectedTransformId === "overview" && S.sidebarItemActive,
                  )}
                  onClick={() => setSelectedTransformId("overview")}
                >
                  <Icon name="document" size={14} c="text-secondary" />
                  <Text>{t`Overview`}</Text>
                </Flex>
                {newTransforms.length > 0 && (
                  <>
                    <Text
                      px="md"
                      py="sm"
                      fz="xs"
                      fw={700}
                      tt="uppercase"
                      c="text-secondary"
                    >
                      {t`New transforms`}
                    </Text>
                    {newTransforms.map((transform) => (
                      <TransformListItem
                        key={transform.ref_id}
                        transform={transform}
                        isSelected={selectedTransformId === transform.ref_id}
                        onClick={() => setSelectedTransformId(transform.ref_id)}
                        workspaceId={workspaceId}
                      />
                    ))}
                  </>
                )}
                {updatedTransforms.length > 0 && (
                  <>
                    <Text
                      px="md"
                      py="sm"
                      fz="xs"
                      fw={700}
                      tt="uppercase"
                      c="text-secondary"
                    >
                      {t`Modified transforms`}
                    </Text>
                    {updatedTransforms.map((transform) => (
                      <TransformListItem
                        key={transform.ref_id}
                        transform={transform}
                        isSelected={selectedTransformId === transform.ref_id}
                        onClick={() => setSelectedTransformId(transform.ref_id)}
                        workspaceId={workspaceId}
                      />
                    ))}
                  </>
                )}
              </Box>
              <Box flex={1} miw={0} style={{ overflow: "auto" }}>
                {selectedTransformId === "overview" ? (
                  <OverviewPanel
                    commitMessageLength={values.commit_message?.length}
                    hasCommitMessageError={!!errors.commit_message}
                    workspaceId={workspaceId}
                    transformCount={workspaceTransforms.length}
                  />
                ) : selectedTransform ? (
                  <DiffView
                    key={selectedTransform.ref_id}
                    transform={selectedTransform}
                    workspaceId={workspaceId}
                  />
                ) : (
                  <Flex align="center" justify="center" h="100%">
                    <Text c="text-secondary">{t`Transform not found`}</Text>
                  </Flex>
                )}
              </Box>
            </Flex>
            <Flex
              justify="flex-end"
              align="center"
              p="md"
              style={{ borderTop: "1px solid var(--mb-color-border)" }}
            >
              <FormSubmitButton
                disabled={
                  !values.commit_message?.trim() ||
                  (touched.commit_message && !!errors.commit_message) ||
                  hasBlockingProblems ||
                  isLoadingWorkspaceProblems ||
                  isDisabled
                }
                label={t`Merge`}
                loading={isLoading}
                variant="filled"
              />
            </Flex>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};
