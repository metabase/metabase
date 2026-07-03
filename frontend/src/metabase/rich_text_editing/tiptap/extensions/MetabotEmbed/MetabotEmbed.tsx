import { isFulfilled } from "@reduxjs/toolkit";
import { type JSONContent, Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown/AIMarkdown";
import MetabotThinkingStyles from "metabase/metabot/components/MetabotChat/MetabotThinking.module.css";
import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  type EditorHost,
  useEditorHost,
} from "metabase/rich_text_editing/tiptap/EditorHost";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { getMentionsCacheKey } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/mentionsUtils";
import { Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import type {
  Card,
  DatasetQuery,
  MetabotGenerateContentRequest,
  VisualizationDisplay,
} from "metabase-types/api";

import { wrapCardEmbed } from "../shared/layout";

import S from "./MetabotEmbed.module.css";

declare module "@tiptap/core" {
  interface EditorEvents {
    runMetabot: ProseMirrorNode; // the metabot node in the AST
  }
}

const getMetabotPromptSerializer =
  (getState: () => State, host: EditorHost): PromptSerializer =>
  (node) => {
    const payload: ReturnType<PromptSerializer> = { instructions: "" };
    return node.content.content.reduce((acc, child) => {
      // Serialize @ mentions in the metabot prompt.
      if (child.type.name === SmartLink.name) {
        const { model, entityId } = child.attrs;
        const key = getMentionsCacheKey({ model, entityId });
        const value = host.selectors.getMentionsCache(getState())[key];
        if (!value) {
          return acc;
        }
        acc.instructions += `[${value.name}](${key})`;
        if (!acc.references) {
          acc.references = {};
        }
        acc.references[key] = value.name;
      } else {
        acc.instructions += child.textContent;
      }
      return acc;
    }, payload);
  };

const createTextNode = (text: string, marks?: JSONContent["marks"]) => {
  return { type: "text", text, marks };
};

// unsets bold/italic/etc when user edits around `content`
const padWithUnstyledText = (content: JSONContent): JSONContent[] => [
  createTextNode(" "),
  content,
  createTextNode(" "),
];

type PromptSerializer = (
  node: ProseMirrorNode,
) => MetabotGenerateContentRequest;

const serializePromptDefault: PromptSerializer = (node) => ({
  instructions: node.textContent,
});

export const MetabotNode = Node.create<{
  getState?: () => State;
}>({
  name: "metabot",
  group: "block",
  content: "inline*",
  marks: "",
  draggable: true,
  selectable: false,
  code: true, // disallows adding markdown (headings, blockquote, etc) to metabot block

  addOptions() {
    return {
      getState: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      // run metabot on mod-Enter
      "mod-Enter": ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }
        editor.emit("runMetabot", $from.parent);
        return true;
      },

      // exit node on arrow down
      ArrowDown: ({ editor }) => {
        const { state } = editor;
        const { selection, doc } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }

        const isAtEnd = $from.parentOffset === $from.parent.nodeSize - 2;

        if (!isAtEnd) {
          return false;
        }

        const after = $from.after();

        if (after === undefined) {
          return false;
        }

        const nodeAfter = doc.nodeAt(after);

        if (nodeAfter) {
          return editor.commands.command(({ tr }) => {
            tr.setSelection(Selection.near(doc.resolve(after)));
            return true;
          });
        }

        return editor.commands.exitCode();
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="metabot"]',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      this.editor.options.editable && this.options.getState
        ? MetabotComponent
        : MetabotComponentUneditable,
    );
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "metabot",
      }),
      0,
    ];
  },
});

type SubmitInputResult = Awaited<
  ReturnType<ReturnType<typeof useMetabotAgent>["submitInput"]>
>;

type MetabotChartDraft = {
  chart_id: string;
  chart_name: string;
  chart_description: string;
  queries: DatasetQuery[];
  visualization_settings: {
    chart_type: VisualizationDisplay;
  };
};

type MetabotChartState = {
  charts?: Record<string, MetabotChartDraft>;
  queries?: Record<string, DatasetQuery>;
};

export const getChartAndQueryFromState = (state?: MetabotChartState) => {
  const charts = state?.charts ?? {};

  return Object.values(charts).map((chart) => ({
    chart,
    query: chart.queries[0],
  }));
};

const getResponseChartAndQuery = (action: SubmitInputResult) => {
  if (!isFulfilled(action)) {
    return [];
  }

  return getChartAndQueryFromState(
    action.payload.data?.state as MetabotChartState | undefined,
  );
};

const MetabotComponentUneditable = memo(() => {
  return (
    <NodeViewWrapper>
      <Flex
        bg="background_page-secondary"
        bd="1px solid var(--border-color)"
        className={S.borderRadius}
        pos="relative"
        direction="column"
        mb="md"
      >
        <Box
          pos="absolute"
          top={0}
          right={0}
          opacity="0.5"
          className={S.closeButton}
        >
          <Box p="md">
            <MetabotIcon data-show-on-print />
          </Box>
        </Box>
        <Flex flex={1} direction="column" className={S.contentWrapper}>
          <NodeViewContent className={S.codeBlockTextArea} />
        </Flex>
      </Flex>
    </NodeViewWrapper>
  );
});
MetabotComponentUneditable.displayName = "MetabotComponentUneditable";

export const MetabotComponent = memo(
  ({ editor, getPos, deleteNode, node, extension }: NodeViewProps) => {
    const dispatch = useDispatch();
    const host = useEditorHost();
    const document = useSelector(host.selectors.getCurrentDocument);
    const { canUseMetabot: isMetabotEnabled } = useUserMetabotPermissions();
    const metabotName = useMetabotName();

    // If no chart was found, show the last agent message instead.
    const [noChartFoundError, setNoChartFoundError] = useState(false);

    const {
      submitInput,
      resetConversation,
      setProfileOverride,
      cancelRequest,
      isDoingScience: isLoading,
      messages,
    } = useMetabotAgent("document");

    const lastMessage = useMemo(() => {
      return (
        messages.filter((m) => m.role === "agent" && m.type === "text").at(-1)
          ?.message ?? ""
      );
    }, [messages]);

    const errorMessage = useMemo(() => {
      const message = messages.findLast(
        (message) =>
          message.role === "agent" && message.type === "turn_errored",
      );

      return (
        message?.display?.message ??
        (message ? t`Something went wrong` : undefined)
      );
    }, [messages]);

    const handleRunMetabot = async () => {
      const serializePrompt = extension?.options?.getState
        ? getMetabotPromptSerializer(extension.options.getState, host)
        : serializePromptDefault;
      const payload = serializePrompt(node);

      if (!payload.instructions.trim()) {
        return;
      }
      editor.commands.focus();

      setNoChartFoundError(false);
      resetConversation();
      setProfileOverride("document-generate-content");

      const response = await submitInput(payload.instructions, {
        preventOpenSidebar: true,
      });

      if (!isFulfilled(response) || !response.payload.success) {
        return;
      }

      const chartAndQuery = getResponseChartAndQuery(response);
      if (!chartAndQuery.length) {
        setNoChartFoundError(true);
        return;
      }

      const nodePosition = getPos();

      if (nodePosition == null) {
        console.error(`Could not find ${metabotName} block`);
        return;
      }

      const cards = await Promise.all(
        chartAndQuery.map(async ({ chart, query }) => {
          const description = chart.chart_description;
          const newCardId = host.actions.generateDraftCardId();
          const card: Card = {
            display: chart.visualization_settings.chart_type,
            dataset_query: query,
            database_id: query.database ?? undefined,
            parameters: [],
            visualization_settings: {},
            id: newCardId,
            entity_id: "entity_id" as Card["entity_id"],
            created_at: "",
            updated_at: "",
            name: chart.chart_name,
            description: null,
            type: "question",
            public_uuid: null,
            enable_embedding: false,
            embedding_params: null,
            can_write: false,
            can_restore: false,
            can_delete: false,
            can_manage_db: false,
            initially_published_at: null,
            collection_id: null,
            collection_position: null,
            dashboard: null,
            dashboard_id: null,
            dashboard_count: null,
            result_metadata: [],
            last_query_start: null,
            average_query_time: null,
            cache_ttl: null,
            archived: false,
          };

          host.analytics.trackAskMetabot(document);
          await dispatch(host.actions.loadMetadataForDocumentCard(card));

          dispatch(
            host.actions.createDraftCard({
              originalCard: card,
              modifiedData: {},
              draftId: newCardId,
            }),
          );

          return {
            cardId: newCardId,
            description,
          };
        }),
      );

      editor.commands.insertContentAt(nodePosition, [
        ...cards.flatMap(({ cardId, description }) => {
          return [
            wrapCardEmbed({
              type: "cardEmbed",
              attrs: {
                id: cardId,
              },
            }),
            ...(description
              ? [
                  {
                    type: "paragraph",
                    content: [createTextNode(description)],
                  },
                ]
              : []),
          ];
        }),
        {
          type: "paragraph",
          content: padWithUnstyledText(
            createTextNode(t`Created with ${metabotName}`, [
              { type: "bold" },
              { type: "italic" },
            ]),
          ),
        },
      ]);

      deleteNode();
    };

    const onRunMetabotRef = useLatest((target: ProseMirrorNode) => {
      if (target === node) {
        handleRunMetabot();
      }
    });
    useEffect(() => {
      const onRunMetabot = (target: ProseMirrorNode) => {
        onRunMetabotRef.current(target);
      };
      editor.on("runMetabot", onRunMetabot);
      return () => {
        editor.off("runMetabot", onRunMetabot);
      };
    }, [editor, onRunMetabotRef]);

    const tooltip = useMemo(() => {
      if (!isMetabotEnabled) {
        return t`${metabotName} is disabled`;
      }
      return isLoading ? t`Stop generating` : null;
    }, [isMetabotEnabled, isLoading, metabotName]);

    return (
      <NodeViewWrapper>
        <Flex
          bg="background_page-secondary"
          bd="1px solid var(--border-color)"
          className={S.borderRadius}
          pos="relative"
          direction="column"
          mb="md"
        >
          <Box
            pos="absolute"
            top={0}
            right={0}
            opacity="0.5"
            className={S.closeButton}
          >
            <Button
              variant="subtle"
              p="sm"
              m="sm"
              size="sm"
              onClick={() => deleteNode()}
            >
              <Icon name="close" data-hide-on-print />
            </Button>
          </Box>
          <Flex flex={1} direction="column" className={S.contentWrapper}>
            <Box
              className={S.placeholder}
              hidden={!!node.content.content.length}
              contentEditable={false}
            >
              {t`Ask ${metabotName} to generate a chart for you, type @ to mention items`}
            </Box>
            <NodeViewContent
              contentEditable={isLoading ? false : undefined}
              className={S.codeBlockTextArea}
            />
          </Flex>
          <Flex px="md" pb="md" pt="sm" gap="sm" contentEditable={false}>
            <Flex flex={1} my="auto">
              {isLoading ? (
                <Text
                  flex={1}
                  className={MetabotThinkingStyles.toolCallStarted}
                >
                  {t`Working on it...`}
                </Text>
              ) : errorMessage ? (
                <Flex gap="sm" c="text-secondary">
                  <Icon name="warning" h="1.2rem" className={S.iconShrink} />
                  <Text c="text-secondary" lh={1.4}>
                    {errorMessage}
                  </Text>
                </Flex>
              ) : noChartFoundError ? (
                <Flex gap="sm" c="text-secondary">
                  <Icon name="warning" h="1.2rem" className={S.iconShrink} />
                  <Text c="text-secondary" lh={1.4}>
                    <AIMarkdown disallowHeading>{lastMessage}</AIMarkdown>
                  </Text>
                </Flex>
              ) : null}
            </Flex>
            <Tooltip
              label={tooltip}
              disabled={tooltip == null}
              position="bottom"
            >
              <Button
                size="sm"
                disabled={!isMetabotEnabled}
                onClick={() =>
                  isLoading ? cancelRequest() : handleRunMetabot()
                }
                classNames={{
                  label: CS.flex, // ensures icon is vertically centered
                }}
                data-hide-on-print
              >
                {isLoading ? <Icon name="close" /> : t`Run`}
              </Button>
            </Tooltip>
          </Flex>
        </Flex>
      </NodeViewWrapper>
    );
  },
);

MetabotComponent.displayName = "MetabotComponent";
