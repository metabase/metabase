import { unifiedMergeView } from "@codemirror/merge";
import { useDisclosure } from "@mantine/hooks";
import type { UnknownAction } from "@reduxjs/toolkit";
import cx from "classnames";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useLocation, useMount } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { getErrorMessage } from "metabase/api/utils";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { slugify } from "metabase/lib/formatting";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import EditorS from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Button,
  Collapse,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Text,
} from "metabase/ui";
import {
  useCreateTransformMutation,
  useLazyGetTransformQuery,
} from "metabase-enterprise/api";
import { useOptionalWorkspace } from "metabase-enterprise/data-studio/workspaces/pages/WorkspacePage/WorkspaceProvider";
import {
  type MetabotAgentEditSuggestionChatMessage,
  activateSuggestedTransform,
  getIsSuggestedTransformActive,
} from "metabase-enterprise/metabot/state";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DraftTransformSource,
  MetabotTransformInfo,
  SuggestedTransform,
  Transform,
} from "metabase-types/api";

import S from "./MetabotAgentSuggestionMessage.module.css";

const PreviewContent = ({
  oldSource,
  newSource,
}: {
  oldSource: string;
  newSource: string;
}) => {
  const extensions = useMemo(
    () =>
      _.compact([
        oldSource &&
          unifiedMergeView({
            original: oldSource,
            mergeControls: false,
            collapseUnchanged: {
              margin: 1,
              minSize: 1,
            },
          }),
      ]),
    [oldSource],
  );

  return (
    <CodeMirror
      className={cx(
        EditorS.editor,
        S.suggestionEditor,
        !oldSource && S.suggestionEditorOnlyNew,
      )}
      extensions={extensions}
      value={newSource}
      readOnly
      autoCorrect="off"
    />
  );
};

const useGetOldTransform = ({
  editorTransform,
  suggestedTransform,
}: MetabotAgentEditSuggestionChatMessage["payload"]) => {
  const [trigger, result] = useLazyGetTransformQuery();
  useMount(() => {
    !editorTransform && suggestedTransform.id && trigger(suggestedTransform.id);
  });

  if (editorTransform) {
    return {
      data: editorTransform,
      isLoading: false,
      error: undefined,
    } as const;
  }

  return result;
};

export const AgentSuggestionMessage = ({
  message,
}: {
  message: MetabotAgentEditSuggestionChatMessage;
}) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const workspace = useOptionalWorkspace();
  const [createTransform] = useCreateTransformMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [isApplying, setIsApplying] = useState(false);
  const [hasAppliedInWorkspace, setHasAppliedInWorkspace] = useState(false);

  const { suggestedTransform, editorTransform } = message.payload;
  const existingTransformId =
    typeof suggestedTransform.id === "number"
      ? suggestedTransform.id
      : undefined;
  const isActive = useSelector((state) =>
    getIsSuggestedTransformActive(state, suggestedTransform.suggestionId),
  );

  const [opened, { toggle }] = useDisclosure(true);

  const url = useLocation();
  const isViewing = url.pathname?.startsWith(
    getTransformUrl(suggestedTransform),
  );

  const canApply = workspace
    ? !hasAppliedInWorkspace && !isApplying
    : !isViewing || !isActive;
  const isNew = !isViewing && !editorTransform && existingTransformId == null;

  const {
    data: originalTransform,
    isLoading,
    error,
  } = useGetOldTransform(message.payload);

  const oldSource = originalTransform
    ? getSourceCode(originalTransform, metadata)
    : "";
  const newSource = getSourceCode(suggestedTransform, metadata);

  const handleApply = async () => {
    dispatch(activateSuggestedTransform(suggestedTransform));

    if (workspace) {
      const targetTransform: Transform | undefined =
        (editorTransform as Transform | undefined) ??
        (originalTransform as Transform | undefined) ??
        (existingTransformId ? (suggestedTransform as unknown as Transform) : undefined);
      const taggedTargetTransfrom = targetTransform ? { ...targetTransform, type: "transform" as const } : undefined;

      if (existingTransformId != null && taggedTargetTransfrom) {
        workspace.addOpenedTransform(taggedTargetTransfrom);
        workspace.setActiveTransform(taggedTargetTransfrom);
        setHasAppliedInWorkspace(true);
        return;
      }

      if (existingTransformId == null && suggestedTransform.target) {
        setIsApplying(true);
        try {
          const normalizeSource = (
            source: DraftTransformSource,
          ): DraftTransformSource => {
            if (source.type !== "query") {
              return source;
            }

            const question = Question.create({
              dataset_query: source.query,
              metadata,
            });
            const query = question.query();
            const { isNative } = Lib.queryDisplayInfo(query);
            const normalizedQuery = isNative
              ? Lib.withNativeQuery(query, Lib.rawNativeQuery(query))
              : query;

            return {
              type: "query",
              query: question.setQuery(normalizedQuery).datasetQuery(),
            };
          };

          const normalizedSource = normalizeSource(suggestedTransform.source);
          const targetWithDatabase =
            suggestedTransform.target &&
            suggestedTransform.target.type === "table"
              ? {
                  ...suggestedTransform.target,
                  database:
                    suggestedTransform.target.database ??
                    (normalizedSource.type === "query"
                      ? normalizedSource.query.database
                      : normalizedSource.type === "python"
                        ? normalizedSource["source-database"]
                        : undefined),
                }
              : suggestedTransform.target;

          const sanitizedTarget =
            targetWithDatabase?.type === "table"
              ? (() => {
                  const fallbackName = slugify(suggestedTransform.name);
                  const trimmedName =
                    targetWithDatabase.name?.trim() || fallbackName;

                  if (!trimmedName) {
                    sendErrorToast(
                      t`Suggestion is missing a target table name to create the transform.`,
                    );
                    setIsApplying(false);
                    return null;
                  }

                  return {
                    ...targetWithDatabase,
                    name: trimmedName,
                    schema:
                      targetWithDatabase.schema &&
                      targetWithDatabase.schema.trim() !== ""
                        ? targetWithDatabase.schema.trim()
                        : null,
                  };
                })()
              : targetWithDatabase;

          if (sanitizedTarget === null) {
            return;
          }

          if (
            targetWithDatabase?.type === "table" &&
            targetWithDatabase.database == null
          ) {
            sendErrorToast(
              t`Suggestion is missing a target database to create the transform.`,
            );
            setIsApplying(false);
            return;
          }

          const transform = await createTransform({
            name: suggestedTransform.name,
            description: suggestedTransform.description ?? null,
            source: normalizedSource,
            target: sanitizedTarget,
          }).unwrap();

          const taggedTransform = { ...transform, type: "transform" as const};

          workspace.addOpenedTransform(taggedTransform);
          workspace.setActiveTransform(taggedTransform);
          setHasAppliedInWorkspace(true);
          sendSuccessToast(t`Transform created`);
          return;
        } catch (error) {
          sendErrorToast(
            getErrorMessage(error) ??
              t`Failed to create transform from suggestion`,
          );
        } finally {
          setIsApplying(false);
        }
      } else if (existingTransformId == null) {
        sendErrorToast(t`Suggestion is missing a target table`);
      }

      return;
    }

    dispatch(push(getTransformUrl(suggestedTransform)) as UnknownAction);
  };

  return (
    <Paper
      shadow="none"
      radius="md"
      bg="background-primary"
      className={S.container}
      data-testid="metabot-chat-suggestion"
    >
      <Group
        p="md"
        align="center"
        justify="space-between"
        onClick={toggle}
        className={cx(opened && S.headerOpened)}
      >
        <Flex align="center" gap="sm">
          <Icon name="transform" size="1rem" c="text-secondary" />
          <Text size="sm">{suggestedTransform.name}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Text size="sm" c={isNew ? "saturated-blue" : "text-secondary"}>
            {isNew ? t`New` : t`Revision`}
          </Text>
          <Flex align="center" justify="center" h="md" w="md">
            <Icon name={opened ? "chevrondown" : "chevronup"} size=".75rem" />
          </Flex>
        </Flex>
      </Group>

      <Collapse
        in={opened}
        transitionDuration={0}
        transitionTimingFunction="linear"
      >
        {match({ isLoading, error })
          .with({ error: P.not(P.nullish) }, () => (
            <Flex
              p="md"
              bg="background-secondary"
              justify="center"
              align="center"
              gap="sm"
            >
              <Text mb="1px" c="danger">{t`Failed to load preview`}</Text>
            </Flex>
          ))
          .with({ isLoading: true }, () => (
            <Flex
              p="md"
              bg="background-secondary"
              justify="center"
              align="center"
              gap="sm"
            >
              <Loader size="xs" c="text-secondary" type="dots" />
              <Text mb="1px" c="text-secondary">{t`Loading preview`}</Text>
            </Flex>
          ))
          .with({ isLoading: false }, () => (
            <PreviewContent oldSource={oldSource} newSource={newSource} />
          ))
          .exhaustive()}

        <Group
          py="xs"
          px="sm"
          align="center"
          justify="space-between"
          style={{
            borderTop: opened ? `1px solid var(--mb-color-border)` : "",
          }}
        >
          <Flex
            align="center"
            justify="flex-end"
            w="100%"
            h="1.375rem"
            gap="sm"
          >
            <Button
              size="compact-xs"
              variant="subtle"
              fw="normal"
              fz="sm"
              c={canApply ? "success" : "text-tertiary"}
              disabled={!canApply}
              onClick={handleApply}
            >
              {isApplying
                ? t`Applying...`
                : match({ isNew, canApply })
                    .with({ canApply: false }, () => t`Applied`)
                    .with({ isNew: true }, () => t`Create`)
                    .with({ canApply: true }, () => t`Apply`)
                    .exhaustive()}
            </Button>
          </Flex>
        </Group>
      </Collapse>
    </Paper>
  );
};

function getSourceCode(
  transform: Pick<MetabotTransformInfo, "source">,
  metadata: Metadata,
): string {
  return match(transform)
    .with({ source: { type: "query" } }, (t) => {
      const metadataProvider = Lib.metadataProvider(
        t.source.query.database,
        metadata,
      );
      const query = Lib.fromJsQuery(metadataProvider, t.source.query);
      if (Lib.queryDisplayInfo(query).isNative) {
        return Lib.rawNativeQuery(query);
      } else {
        return "";
      }
    })
    .with({ source: { type: "python" } }, (t) => t.source.body)
    .otherwise(() => "");
}

function getTransformUrl(transform: SuggestedTransform): string {
  return match(transform)
    .with({ id: P.number }, ({ id }) => Urls.transformEdit(id))
    .with({ source: { type: "python" } }, () => Urls.newPythonTransform())
    .with({ source: { type: "query" } }, () => Urls.newNativeTransform())
    .exhaustive();
}
