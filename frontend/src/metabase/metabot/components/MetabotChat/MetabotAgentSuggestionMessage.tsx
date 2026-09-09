import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useEffect, useState } from "react";
import { useLocation } from "react-use";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetTransformQuery } from "metabase/api";
import type {
  MetabotAgentDataPartMessage,
  MetabotDataPart,
} from "metabase/metabot/state";
import { useMetadataProviderFactory } from "metabase/metadata-store";
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

export const AgentSuggestionMessage = ({
  message,
}: {
  message: SuggestionMessage;
}) => {
  const getMetadataProvider = useMetadataProviderFactory();

  const suggestedTransform: MetabotSuggestedTransform = {
    ...message.part.data,
    active: true,
    suggestionId: message.id,
  };
  const existingTransformId =
    typeof suggestedTransform.id === "number"
      ? suggestedTransform.id
      : undefined;
  const [opened, { toggle }] = useDisclosure(true);

  const url = useLocation();
  const isViewing =
    url.pathname?.startsWith(getTransformUrl(suggestedTransform)) ?? false;

  const isNew = !isViewing && existingTransformId == null;

  const {
    data: originalTransform,
    isLoading,
    error,
  } = useGetTransformQuery(existingTransformId ?? skipToken);

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

  return (
    <Paper
      shadow="none"
      radius="sm"
      bg="background_page-primary"
      className={S.container}
      data-testid="metabot-chat-suggestion"
    >
      <Group
        p="lg"
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
          <Flex align="center" justify="center" h="lg" w="lg">
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
              p="lg"
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
              p="lg"
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
          py="xxs"
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
            <Button
              size="compact-xs"
              variant="subtle"
              fw="normal"
              fz="sm"
              c="text-disabled"
              disabled
            >
              {isNew ? t`Create` : t`Apply`}
            </Button>
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
