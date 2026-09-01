import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useContext, useEffect, useState } from "react";
import { useLocation, useMount } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useLazyGetTransformQuery } from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import { MetabotContext } from "metabase/metabot/context";
import {
  type MetabotAgentDataPartMessage,
  type MetabotDataPart,
  activateSuggestedTransform,
  getIsSuggestedTransformActive,
} from "metabase/metabot/state";
import { useMetadataProviderFactory } from "metabase/metadata-store";
import { useDispatch, useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import {
  Button,
  Collapse,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type {
  DatabaseId,
  MetabotSuggestedTransform,
  MetabotTransformInfo,
  SuggestedTransform,
} from "metabase-types/api";

import S from "./MetabotAgentSuggestionMessage.module.css";
import {
  SuggestionPreviewContent,
  loadSuggestionPreview,
} from "./lazySuggestionPreviewContent";

export type SuggestionMessage = Omit<MetabotAgentDataPartMessage, "part"> & {
  part: Extract<MetabotDataPart, { type: "data-transform_suggestion" }>;
};

const useGetOldTransform = ({
  editorTransform,
  suggestedTransform,
}: {
  editorTransform: MetabotTransformInfo | undefined;
  suggestedTransform: MetabotSuggestedTransform;
}) => {
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
  readonly,
}: {
  message: SuggestionMessage;
  readonly?: boolean;
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const getMetadataProvider = useMetadataProviderFactory();
  const { suggestionActions } = useContext(MetabotContext);
  const { sendErrorToast } = useMetadataToasts();
  const [isApplying, setIsApplying] = useState(false);
  const [hasAppliedInContext, setHasAppliedInContext] = useState(false);

  const suggestedTransform: MetabotSuggestedTransform = {
    ...message.part.data,
    active: true,
    suggestionId: message.metadata?.suggestionId ?? message.id,
  };
  const editorTransform = message.metadata?.editorTransform;
  const existingTransformId =
    typeof suggestedTransform.id === "number"
      ? suggestedTransform.id
      : undefined;
  const isActive = useSelector((state) =>
    getIsSuggestedTransformActive(state, suggestedTransform.suggestionId),
  );

  const [opened, { toggle }] = useDisclosure(true);

  const url = useLocation();
  const isViewing =
    url.pathname?.startsWith(getTransformUrl(suggestedTransform)) ?? false;

  const canApply = suggestionActions
    ? !hasAppliedInContext && !isApplying
    : !isViewing || !isActive;

  const isNew = !isViewing && !editorTransform && existingTransformId == null;

  const applyBtnText = match({ isApplying, isNew, canApply })
    .with({ isApplying: true }, () => t`Applying...`)
    .with({ canApply: false }, () => t`Applied`)
    .with({ isNew: true }, () => t`Create`)
    .with({ canApply: true }, () => t`Apply`)
    .exhaustive();

  const {
    data: originalTransform,
    isLoading,
    error,
  } = useGetOldTransform({ editorTransform, suggestedTransform });

  // The preview is a separate chunk. Waiting for it inside the existing
  // "Loading preview" state means one loading state rather than two in a row.
  const [isPreviewLoaded, setIsPreviewLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSuggestionPreview().then(() => {
      if (!cancelled) {
        setIsPreviewLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const oldSource = originalTransform
    ? getSourceCode(originalTransform, getMetadataProvider)
    : "";
  const newSource = getSourceCode(suggestedTransform, getMetadataProvider);

  const handleApply = async () => {
    dispatch(activateSuggestedTransform(suggestedTransform));

    if (suggestionActions) {
      setIsApplying(true);
      try {
        const result = await suggestionActions.applySuggestion({
          editorTransform,
          suggestedTransform,
        });
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

    navigate(getTransformUrl(suggestedTransform));
  };

  return (
    <Paper
      shadow="none"
      radius="md"
      bg="background_page-primary"
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
          <Text size="sm" c={isNew ? "core-blue-saturated" : "text-secondary"}>
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
        {match({ isLoading: isLoading || !isPreviewLoaded, error })
          .with({ error: P.not(P.nullish) }, () => (
            <Flex
              p="md"
              bg="background_page-secondary"
              justify="center"
              align="center"
              gap="sm"
            >
              <Text
                mb="1px"
                c="feedback-negative"
              >{t`Failed to load preview`}</Text>
            </Flex>
          ))
          .with({ isLoading: true }, () => (
            <Flex
              p="md"
              bg="background_page-secondary"
              justify="center"
              align="center"
              gap="sm"
            >
              <Loader size="xs" c="text-secondary" type="dots" />
              <Text mb="1px" c="text-secondary">{t`Loading preview`}</Text>
            </Flex>
          ))
          .with({ isLoading: false }, () => (
            <SuggestionPreviewContent
              oldSource={oldSource}
              newSource={newSource}
            />
          ))
          .exhaustive()}

        <Group
          py="xs"
          px="sm"
          align="center"
          justify="space-between"
          style={{
            borderTop: opened ? `1px solid var(--mb-color-border-neutral)` : "",
          }}
        >
          <Flex
            align="center"
            justify="flex-end"
            w="100%"
            h="1.375rem"
            gap="sm"
          >
            <Tooltip label={t`Read only`} disabled={!readonly}>
              <Button
                size="compact-xs"
                variant="subtle"
                fw="normal"
                fz="sm"
                c={
                  canApply && !readonly ? "feedback-positive" : "text-disabled"
                }
                disabled={!canApply || readonly}
                onClick={handleApply}
              >
                {applyBtnText}
              </Button>
            </Tooltip>
          </Flex>
        </Group>
      </Collapse>
    </Paper>
  );
};

function getSourceCode(
  transform: Pick<MetabotTransformInfo, "source">,
  getMetadataProvider: (databaseId: DatabaseId | null) => Lib.MetadataProvider,
): string {
  return match(transform)
    .with({ source: { type: "query" } }, (t) => {
      const metadataProvider = getMetadataProvider(t.source.query.database);
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
