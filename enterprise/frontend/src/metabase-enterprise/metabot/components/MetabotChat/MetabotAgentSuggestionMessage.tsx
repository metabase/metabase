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

import { useLazyGetTransformQuery } from "metabase/api";
import { CodeMirror } from "metabase/common/components/CodeMirror";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import EditorS from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/CodeMirrorEditor.module.css";
import { getMetadata } from "metabase/selectors/metadata";
import { getIsWorkspace } from "metabase/selectors/routing";
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
import { useMetabotSuggestionActions } from "metabase-enterprise/metabot/context";
import {
  type MetabotAgentEditSuggestionChatMessage,
  activateSuggestedTransform,
  getIsSuggestedTransformActive,
} from "metabase-enterprise/metabot/state";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  MetabotTransformInfo,
  SuggestedTransform,
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
    if (!editorTransform && suggestedTransform.id) {
      trigger(suggestedTransform.id);
    }
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
  const isWorkspace = useSelector(getIsWorkspace);
  const suggestionActions = useMetabotSuggestionActions();
  const { sendErrorToast } = useMetadataToasts();
  const [isApplying, setIsApplying] = useState(false);
  const [hasAppliedInContext, setHasAppliedInContext] = useState(false);

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
  // In workspace context, we don't use URL-based navigation, so isViewing should be false
  // This ensures suggestions always show properly in workspace
  const isViewing = isWorkspace
    ? false
    : (url.pathname?.startsWith(getTransformUrl(suggestedTransform)) ?? false);

  const canApply = suggestionActions
    ? !hasAppliedInContext && !isApplying
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

    if (suggestionActions) {
      setIsApplying(true);
      try {
        const result = await suggestionActions.applySuggestion(message.payload);
        if (result.status === "applied") {
          setHasAppliedInContext(true);
        } else {
          sendErrorToast(result.message);
        }
      } finally {
        setIsApplying(false);
      }
      return;
    }

    // In workspace context, don't redirect - the suggestion actions should handle it
    // If we get here, it means suggestionActions is not available, which shouldn't happen
    // in workspace context, but we'll prevent the redirect anyway
    if (isWorkspace) {
      sendErrorToast(
        t`Unable to apply suggestion. Please try again or refresh the page.`,
      );
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
