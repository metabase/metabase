import { unifiedMergeView } from "@codemirror/merge";
import { useDisclosure } from "@mantine/hooks";
import type { UnknownAction } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { useLocation, useMount } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useDispatch, useSelector } from "metabase/lib/redux";
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
  useLazyGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import {
  type MetabotAgentEditSuggestionChatMessage,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  DatasetQuery,
  Transform,
  TransformSource,
} from "metabase-types/api";

const PreviewContent = ({
  oldSource,
  newSource,
}: {
  oldSource?: string;
  newSource: string;
}) => {
  return (
    <CodeMirror
      className={EditorS.editor}
      extensions={
        oldSource
          ? [
              unifiedMergeView({
                original: oldSource,
                mergeControls: false,
                collapseUnchanged: {
                  margin: 3,
                  minSize: 4,
                },
              }),
            ]
          : undefined
      }
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
  // TODO: code comment
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

// TODO: need to handle suggestion invalidation and consumed states:
// - accepted in sidebar
// - rejected in sidebar
// - latest transform no long matches base transform
// - accepted / rejected via the editor

export const AgentSuggestionMessage = ({
  message,
}: {
  message: MetabotAgentEditSuggestionChatMessage;
}) => {
  const { suggestedTransform } = message.payload;

  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const url = useLocation();
  const isViewing = url.pathname?.startsWith(
    `/admin/transforms/${suggestedTransform.id}/query`,
  );

  // TODO: optimization: abstract out submitting values to metabot into a seperate light-weight hook that this component does not have to re-render on every update to messages
  const metabot = useMetabotAgent();

  const {
    data: originalTransform,
    isLoading,
    error,
  } = useGetOldTransform(message.payload);

  // TODO: handle loading state
  const [updateTransform, { isLoading: isUpdating }] =
    useUpdateTransformMutation();

  const [opened, { toggle }] = useDisclosure(!isViewing);

  function getSourceCode(transform: Pick<Transform, "source">): string {
    return match(transform)
      .with(
        { source: { type: "query", query: { type: "native" } } },
        (t) => t.source.query.native.query,
      )
      .otherwise(() => "");
  }

  const oldSource = originalTransform ? getSourceCode(originalTransform) : "";
  const newSource = getSourceCode(suggestedTransform);

  const parseTemplateTags = (source: TransformSource): TransformSource => {
    // TODO: fix
    if (source.type === "python") {
      alert("TODO: sloan is on this 🫡... self distructing in 3... 2... 1");
      throw new Error("blarf");
    }

    // For unsaved native queries, ensure template tags (like #{{123-my-model}}) are parsed from query text
    const query = source.query;
    let question = Question.create({ dataset_query: query, metadata });
    const { isNative } = Lib.queryDisplayInfo(question.query());

    if (isNative && !question.isSaved()) {
      question = question.setQuery(
        Lib.withNativeQuery(
          question.query(),
          Lib.rawNativeQuery(question.query()),
        ),
      );

      return {
        ...source,
        query: question.datasetQuery(),
      };
    } else {
      return source;
    }
  };

  const handleFocus = (
    config?: { skipToSave?: boolean },
    transformToUse?: Transform,
  ) => {
    const transform = transformToUse || suggestedTransform;

    const processedSource = parseTemplateTags(transform.source);
    const processedTransform = {
      ...transform,
      source: processedSource,
    };

    const url = transform.id
      ? `/admin/transforms/${transform.id}/query`
      : `/admin/transforms/new/native${config?.skipToSave ? "?autoSave=true" : ""}`;
    dispatch(push(url) as UnknownAction);
    dispatch(setSuggestedTransform(processedTransform));
  };

  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const handleSave = async (query: DatasetQuery) => {
    if (suggestedTransform.id) {
      // Create a temporary source to process template tags
      const tempSource = { ...suggestedTransform.source, query };
      const processedSource = parseTemplateTags(tempSource);
      const { error } = await updateTransform({
        id: suggestedTransform.id,
        source: processedSource,
      });

      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);
      }
    } else {
      // console.log("TODO");
    }
  };

  const handleAccept = async () => {
    if (!isViewing && !suggestedTransform.id) {
      const processedSource = parseTemplateTags(suggestedTransform.source);
      const processedTransform = {
        ...suggestedTransform,
        source: processedSource,
      };
      dispatch(setSuggestedTransform(processedTransform));
      handleFocus({ skipToSave: true });
    }

    if (suggestedTransform.id) {
      // TODO: fix
      if (suggestedTransform.source.type === "python") {
        alert("TODO: sloan is on this 🫡... self distructing in 3... 2... 1");
        throw new Error("blarf");
      }

      await handleSave(suggestedTransform.source.query);
      metabot.submitInput({
        type: "action",
        message:
          "HIDDEN MESSAGE: user has accepted your changes, move to the next step!",
        // @ts-expect-error -- TODO
        userMessage: "✅ You accepted the change",
      });
    }
  };
  const handleReject = () => {
    dispatch(setSuggestedTransform(undefined));
    metabot.submitInput({
      type: "action",
      message:
        "HIDDEN MESSAGE: the user has rejected your changes, ask for clarification on what they'd like to do instead.",
      // @ts-expect-error -- TODO
      userMessage: "❌ You rejected the change",
    });
  };

  return (
    <Paper
      shadow="none"
      radius="md"
      bg="white"
      style={{ border: `1px solid var(--mb-color-border)` }}
    >
      <Group
        p="md"
        align="center"
        justify="space-between"
        onClick={toggle}
        style={{
          borderBottom: opened ? `1px solid var(--mb-color-border)` : "",
        }}
      >
        <Flex align="center" gap="sm">
          <Icon name="refresh_downstream" size="1rem" c="text-secondary" />
          <Text size="sm">{suggestedTransform.name}</Text>
        </Flex>
        <Flex align="center" gap="sm">
          <Text
            size="sm"
            c={
              suggestedTransform.id
                ? "text-secondary"
                : "var(--mb-color-saturated-blue)"
            }
          >
            {suggestedTransform.id ? t`Revision` : t`New`}
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
            <Flex p="md" bg="bg-light" justify="center" align="center" gap="sm">
              <Text mb="1px" c="danger">{t`Failed to load preview`}</Text>
            </Flex>
          ))
          .with({ isLoading: true }, () => (
            <Flex p="md" bg="bg-light" justify="center" align="center" gap="sm">
              <Loader size="xs" color="text-secondary" type="dots" />
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
          <Flex align="center" gap="sm">
            <Button
              size="compact-xs"
              disabled={isViewing}
              variant="subtle"
              fw="normal"
              fz="sm"
              c={isViewing ? "text-lighter" : "text-secondary"}
              onClick={() => handleFocus()}
            >
              {isViewing ? t`Focused` : t`Focus`}
            </Button>
          </Flex>

          <Flex align="center" gap="sm">
            <Button
              size="compact-xs"
              variant="subtle"
              fw="normal"
              fz="sm"
              c="success"
              disabled={isUpdating}
              onClick={handleAccept}
            >{t`Accept`}</Button>
            <Button
              size="compact-xs"
              variant="subtle"
              fw="normal"
              fz="sm"
              c="danger"
              disabled={isUpdating}
              onClick={handleReject}
            >{t`Reject`}</Button>
          </Flex>
        </Group>
      </Collapse>
    </Paper>
  );
};
