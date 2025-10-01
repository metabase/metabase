import { unifiedMergeView } from "@codemirror/merge";
import { useDisclosure } from "@mantine/hooks";
import type { UnknownAction } from "@reduxjs/toolkit";
import cx from "classnames";
import { useMemo } from "react";
import { push } from "react-router-redux";
import { useLocation, useMount } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
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
  useGetTransformQuery,
  useLazyGetTransformQuery,
} from "metabase-enterprise/api";
import {
  type MetabotAgentEditSuggestionChatMessage,
  setSuggestedTransform,
} from "metabase-enterprise/metabot/state";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  MetabotTransformInfo,
  QueryTransformSource,
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
    () => [
      unifiedMergeView({
        original: oldSource,
        mergeControls: false,
        collapseUnchanged: {
          margin: 1,
          minSize: 1,
        },
      }),
    ],
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

const parseTemplateTags = (
  source: QueryTransformSource,
  metadata: Metadata,
): QueryTransformSource => {
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

export const AgentSuggestionMessage = ({
  message,
}: {
  message: MetabotAgentEditSuggestionChatMessage;
}) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const { suggestedTransform } = message.payload;
  const isNew = !suggestedTransform.id;

  const url = useLocation();
  const transformUrl = getTransformUrl(suggestedTransform);
  const isViewing = !!url.pathname?.startsWith(transformUrl);

  const [opened, { toggle }] = useDisclosure(!isViewing);

  const {
    data: originalTransform,
    isLoading,
    error,
  } = useGetOldTransform(message.payload);

  const { data: latestTransform } = useGetTransformQuery(
    suggestedTransform.id || skipToken,
  );

  const oldSource = originalTransform ? getSourceCode(originalTransform) : "";
  const newSource = getSourceCode(suggestedTransform);
  const latestSource = latestTransform
    ? getSourceCode(latestTransform)
    : undefined;

  const isStale = latestSource && oldSource !== latestSource;

  const handleFocus = () => {
    const transform = processTransform(suggestedTransform, metadata);
    dispatch(setSuggestedTransform(transform));
    dispatch(push(transformUrl) as UnknownAction);
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
            c={isNew ? "var(--mb-color-saturated-blue)" : "text-secondary"}
          >
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
          <Flex
            align="center"
            justify="flex-end"
            w="100%"
            h="1.375rem"
            gap="sm"
          >
            {!isStale && (
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
            )}
          </Flex>
        </Group>
      </Collapse>
    </Paper>
  );
};

function getSourceCode(transform: Pick<Transform, "source">): string {
  return match(transform)
    .with(
      { source: { type: "query", query: { type: "native" } } },
      (t) => t.source.query.native.query,
    )
    .with({ source: { type: "python" } }, (t) => t.source.body)
    .otherwise(() => "");
}

function processTransform(transform: SuggestedTransform, metadata: Metadata) {
  const processedSource =
    transform.source.type === "query"
      ? parseTemplateTags(transform.source, metadata)
      : transform.source;
  return {
    ...transform,
    source: processedSource,
  };
}

function getTransformUrl(transform: SuggestedTransform): string {
  return match(transform)
    .with({ id: P.number }, ({ id }) => Urls.transformEdit(id))
    .with({ source: { type: "python" } }, Urls.newPythonTransform)
    .with({ source: { type: "query" } }, Urls.newNativeTransform)
    .exhaustive();
}
