import { unifiedMergeView } from "@codemirror/merge";
import cx from "classnames";
import { diffLines } from "diff";
import { useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import EditorS from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Box,
  Collapse,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import {
  useGetWorkspaceProblemsQuery,
  useLazyGetTransformQuery,
  useLazyGetWorkspaceTransformQuery,
} from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  TransformSource,
  WorkspaceId,
  WorkspaceTransformItem,
} from "metabase-types/api";

import S from "./MergeWorkspaceModal.module.css";
import type { ProblemCheckCategory } from "./problemUtils";
import {
  formatProblemDetails,
  getCheckName,
  getCheckStatus,
  getCheckStatusWithUnused,
  groupProblemsByCategory,
} from "./problemUtils";

const MAX_COMMIT_MESSAGE_LENGTH = 255;

type ReviewChangesModalProps = {
  onClose: VoidFunction;
  onSubmit: (commitMessage: string) => Promise<void>;
  isLoading?: boolean;
  workspaceId: WorkspaceId;
  workspaceName: string;
  workspaceTransforms: WorkspaceTransformItem[];
};

type MergeWorkspaceFormValues = {
  commit_message: string;
};

const initialValues: MergeWorkspaceFormValues = {
  commit_message: "",
};

const getMergeWorkspaceSchema = () =>
  Yup.object().shape({
    commit_message: Yup.string()
      .trim()
      .max(MAX_COMMIT_MESSAGE_LENGTH, t`Commit message is too long.`)
      .required(t`Please provide a commit message.`),
  });

function getSourceCode(
  transform: { source: TransformSource },
  metadata: Metadata,
): string {
  if (transform.source.type === "python") {
    return transform.source.body;
  }
  if (transform.source.type === "query") {
    const metadataProvider = Lib.metadataProvider(
      transform.source.query.database,
      metadata,
    );
    const query = Lib.fromJsQuery(metadataProvider, transform.source.query);
    if (Lib.queryDisplayInfo(query).isNative) {
      return Lib.rawNativeQuery(query);
    }
  }
  return "";
}

function computeDiffStats(
  oldSource: string,
  newSource: string,
): { additions: number; deletions: number } {
  const changes = diffLines(oldSource, newSource);
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const lineCount = change.count ?? 0;
    if (change.added) {
      additions += lineCount;
    } else if (change.removed) {
      deletions += lineCount;
    }
  }

  return { additions, deletions };
}

const QualityChecksSection = ({
  workspaceId,
}: {
  workspaceId: WorkspaceId;
}) => {
  const { data: problems = [], isLoading } =
    useGetWorkspaceProblemsQuery(workspaceId);
  const grouped = useMemo(() => groupProblemsByCategory(problems), [problems]);
  const [expandedChecks, setExpandedChecks] = useState<
    Set<ProblemCheckCategory>
  >(new Set());

  const checkCategories: ProblemCheckCategory[] = [
    "external-dependencies",
    "internal-dependencies",
    "structural-issues",
    "unused-outputs",
  ];

  const toggleCheck = (category: ProblemCheckCategory) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Quality Checks`}</Text>
      <Stack gap="sm">
        {checkCategories.map((category) => {
          const categoryProblems = grouped[category];
          const checkStatus =
            category === "unused-outputs"
              ? getCheckStatusWithUnused(categoryProblems)
              : getCheckStatus(categoryProblems);
          const isExpanded = expandedChecks.has(category);
          const hasProblems = checkStatus.count > 0;

          return (
            <Box key={category}>
              <Group
                justify="space-between"
                style={{ cursor: hasProblems ? "pointer" : "default" }}
                onClick={() => hasProblems && toggleCheck(category)}
              >
                <Text>{getCheckName(category)}</Text>
                {isLoading ? (
                  <Loader size="xs" />
                ) : (
                  <Group gap="xs">
                    {checkStatus.status === "passed" && (
                      <Icon name="check" size={14} c="success" />
                    )}
                    <Text
                      c={
                        checkStatus.status === "passed"
                          ? "success"
                          : checkStatus.problems.some(
                                (p) => p.severity === "error",
                              )
                            ? "error"
                            : "warning"
                      }
                    >
                      {checkStatus.status === "passed"
                        ? category === "unused-outputs" && checkStatus.count > 0
                          ? t`${checkStatus.count} info`
                          : t`Passed`
                        : checkStatus.count === 1
                          ? t`Failed`
                          : t`${checkStatus.count} issues`}
                    </Text>
                  </Group>
                )}
              </Group>
              {hasProblems && (
                <Collapse in={isExpanded}>
                  <Stack gap="xs" mt="xs" pl="md">
                    {checkStatus.problems.map((problem, idx) => (
                      <Box key={idx}>
                        <Text size="sm" c="text-medium">
                          {formatProblemDetails(problem)}
                        </Text>
                      </Box>
                    ))}
                  </Stack>
                </Collapse>
              )}
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
};

const OverviewPanel = ({
  commitMessageLength = 0,
  hasCommitMessageError,
  workspaceId,
  transformCount,
}: {
  commitMessageLength?: number;
  hasCommitMessageError: boolean;
  workspaceId: WorkspaceId;
  transformCount: number;
}) => {
  return (
    <Box p="xl" h="100%" style={{ overflowY: "auto" }}>
      <Stack>
        <Box>
          <Text>{t`This will merge all changes from this workspace back to the source transforms.`}</Text>
          <Text mt="xs">
            {t`The commit message will be used to display the history of transform changes.`}
          </Text>
        </Box>
        <Stack mt="md" gap="xs">
          <FormTextarea
            data-autofocus
            label={t`Commit message`}
            name="commit_message"
            placeholder={t`Describe the changes you made in this workspace...`}
            minRows={4}
            required
          />
          {!hasCommitMessageError && (
            <Text size="xs" c="text-tertiary">
              {commitMessageLength}/{MAX_COMMIT_MESSAGE_LENGTH}
            </Text>
          )}
        </Stack>
        <QualityChecksSection workspaceId={workspaceId} />
        <Box
          p="md"
          style={{
            backgroundColor: "var(--mb-color-bg-light)",
            borderRadius: "var(--mb-radius-sm)",
          }}
        >
          <Text>
            {ngettext(
              msgid`${transformCount} transform will be merged`,
              `${transformCount} transforms will be merged`,
              transformCount,
            )}
          </Text>
        </Box>
      </Stack>
    </Box>
  );
};

const DiffView = ({
  transform,
  workspaceId,
}: {
  transform: WorkspaceTransformItem;
  workspaceId: WorkspaceId;
}) => {
  const metadata = useSelector(getMetadata);
  const isNewTransform = transform.global_id == null;

  const [fetchWorkspaceTransform, workspaceTransformResult] =
    useLazyGetWorkspaceTransformQuery();
  const [fetchGlobalTransform, globalTransformResult] =
    useLazyGetTransformQuery();

  useEffect(() => {
    fetchWorkspaceTransform({
      workspaceId,
      transformId: transform.ref_id,
    });
    if (transform.global_id) {
      fetchGlobalTransform(transform.global_id);
    }
  }, [
    transform.global_id,
    transform.ref_id,
    workspaceId,
    fetchWorkspaceTransform,
    fetchGlobalTransform,
  ]);

  const isLoading =
    workspaceTransformResult.isLoading ||
    (!isNewTransform && globalTransformResult.isLoading);
  const hasError =
    workspaceTransformResult.error ||
    (!isNewTransform && globalTransformResult.error);

  const oldSource = globalTransformResult.data
    ? getSourceCode(globalTransformResult.data, metadata)
    : "";
  const newSource = workspaceTransformResult.data
    ? getSourceCode(workspaceTransformResult.data, metadata)
    : "";

  const extensions = useMemo(
    () =>
      _.compact([
        oldSource &&
          unifiedMergeView({
            original: oldSource,
            mergeControls: false,
          }),
      ]),
    [oldSource],
  );

  if (isLoading) {
    return (
      <Flex
        align="center"
        justify="center"
        h="100%"
        direction="column"
        gap="sm"
      >
        <Loader size="sm" />
        <Text c="text-medium">{t`Loading diff...`}</Text>
      </Flex>
    );
  }

  if (hasError) {
    return (
      <Flex align="center" justify="center" h="100%">
        <Text c="danger">{t`Failed to load diff`}</Text>
      </Flex>
    );
  }

  if (!newSource) {
    return (
      <Flex align="center" justify="center" h="100%">
        <Text c="text-medium">{t`No source code to display`}</Text>
      </Flex>
    );
  }

  return (
    <CodeMirror
      className={cx(EditorS.editor, S.diffEditor)}
      extensions={extensions}
      value={newSource}
      readOnly
      autoCorrect="off"
    />
  );
};

const TransformListItem = ({
  transform,
  isSelected,
  onClick,
  workspaceId,
}: {
  transform: WorkspaceTransformItem;
  isSelected: boolean;
  onClick: () => void;
  workspaceId: WorkspaceId;
}) => {
  const metadata = useSelector(getMetadata);
  const isNewTransform = transform.global_id == null;
  const [fetchWorkspaceTransform, workspaceTransformResult] =
    useLazyGetWorkspaceTransformQuery();
  const [fetchGlobalTransform, globalTransformResult] =
    useLazyGetTransformQuery();

  useEffect(() => {
    fetchWorkspaceTransform({
      workspaceId,
      transformId: transform.ref_id,
    });
    if (transform.global_id) {
      fetchGlobalTransform(transform.global_id);
    }
  }, [
    transform.global_id,
    transform.ref_id,
    workspaceId,
    fetchWorkspaceTransform,
    fetchGlobalTransform,
  ]);

  const oldSource = globalTransformResult.data
    ? getSourceCode(globalTransformResult.data, metadata)
    : "";
  const newSource = workspaceTransformResult.data
    ? getSourceCode(workspaceTransformResult.data, metadata)
    : "";

  const stats = useMemo(() => {
    if (isNewTransform && newSource) {
      // For new transforms, count all lines as additions
      const lineCount = newSource.split("\n").length;
      return { additions: lineCount, deletions: 0 };
    }
    if (oldSource && newSource) {
      return computeDiffStats(oldSource, newSource);
    }
    return null;
  }, [isNewTransform, oldSource, newSource]);

  return (
    <Flex
      align="center"
      justify="space-between"
      px="md"
      py="sm"
      className={cx(S.sidebarItem, isSelected && S.sidebarItemActive)}
      onClick={onClick}
    >
      <Flex align="center" gap="sm" style={{ overflow: "hidden" }}>
        <Icon name="code_block" size={14} c="text-medium" />
        <Text truncate>{transform.name}</Text>
      </Flex>
      {stats && (stats.additions > 0 || stats.deletions > 0) && (
        <Flex gap="xs" fz="xs" style={{ flexShrink: 0 }}>
          {stats.additions > 0 && <Text c="success">+{stats.additions}</Text>}
          {stats.deletions > 0 && <Text c="danger">-{stats.deletions}</Text>}
        </Flex>
      )}
    </Flex>
  );
};

export const ReviewChangesModal = ({
  onClose,
  onSubmit,
  isLoading = false,
  workspaceId,
  workspaceName,
  workspaceTransforms,
}: ReviewChangesModalProps) => {
  const { sendErrorToast } = useMetadataToasts();
  const validationSchema = useMemo(() => getMergeWorkspaceSchema(), []);

  const { data: workspaceProblems = [] } =
    useGetWorkspaceProblemsQuery(workspaceId);
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
            <Text size="sm" c="text-medium">
              {workspaceName}
            </Text>
          </Flex>
        </Flex>
      }
      size="xl"
      padding={0}
      styles={{
        header: {
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid var(--mb-color-border)",
        },
      }}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        {({ values, touched, errors }) => (
          <Form style={{ display: "flex", flexDirection: "column" }}>
            <Flex h={500}>
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
                  <Icon name="document" size={14} c="text-medium" />
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
                      c="text-medium"
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
                      c="text-medium"
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
                    <Text c="text-medium">{t`Transform not found`}</Text>
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
                  hasBlockingProblems
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

export { ReviewChangesModal as MergeWorkspaceModal };
