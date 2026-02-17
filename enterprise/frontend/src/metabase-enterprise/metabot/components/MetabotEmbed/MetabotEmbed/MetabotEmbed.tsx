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
import { trackDocumentAskMetabot } from "metabase/documents/analytics";
import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase/documents/documents.slice";
import {
  getCurrentDocument,
  getMentionsCache,
} from "metabase/documents/selectors";
import { getMentionsCacheKey } from "metabase/documents/utils/mentionsUtils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_METABOT } from "metabase/plugins";
import { SmartLink } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/SmartLinkNode";
import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";
import { Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { AIMarkdown } from "metabase-enterprise/metabot/components/AIMarkdown";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import type { Card, MetabotGenerateContentRequest } from "metabase-types/api";
import type { State } from "metabase-types/store";

import S from "./MetabotEmbed.module.css";

declare module "@tiptap/core" {
  interface EditorEvents {
    runMetabot: ProseMirrorNode; // the metabot node in the AST
  }
}

const getMetabotPromptSerializer =
  (getState: () => State): PromptSerializer =>
  (node) => {
    const payload: ReturnType<PromptSerializer> = { instructions: "" };
    return node.content.content.reduce((acc, child) => {
      // Serialize @ mentions in the metabot prompt
      if (child.type.name === SmartLink.name) {
        const { model, entityId } = child.attrs;
        const key = getMentionsCacheKey({ model, entityId });
        const value = getMentionsCache(getState())[key];
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

const getResponseChartAndQuery = (action: SubmitInputResult) => {
  if (!isFulfilled(action)) {
    return [];
  }

  const charts = action.payload.data?.state?.charts ?? {};
  const queries = action.payload.data?.state?.queries ?? {};

  return Object.values(charts).map((chart) => {
    const query = queries[chart["query-id"]];

    return { chart, query };
  });
};

const MetabotComponentUneditable = memo(() => {
  return (
    <NodeViewWrapper>
      <Flex
        bg="background-secondary"
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
            <Icon name="metabot" />
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
    const document = useSelector(getCurrentDocument);
    const isMetabotEnabled = PLUGIN_METABOT.isEnabled();

    // If no chart was found, we want to present last LLM message.
    const [noChartFoundError, setNoChartFoundError] = useState(false);

    const {
      submitInput,
      resetConversation,
      setProfileOverride,
      errorMessages,
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

    useRegisterMetabotContextProvider(async () => {
      return {
        disabled_data_parts: ["navigate_to"],
      };
    });

    const handleRunMetabot = async () => {
      const serializePrompt = extension?.options?.getState
        ? getMetabotPromptSerializer(extension.options.getState)
        : serializePromptDefault;
      const payload = serializePrompt(node);

      if (!payload.instructions.trim()) {
        return;
      }
      editor.commands.focus();

      setNoChartFoundError(false);
      resetConversation();
      setProfileOverride("document");

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
        console.error("Could not find Metabot block");
        return;
      }

      const cards = await Promise.all(
        chartAndQuery.map(async ({ chart, query }) => {
          const description = chart["chart-description"];
          const newCardId = generateDraftCardId();
          const card: Card = {
            display: chart["chart-type"],
            dataset_query: query,
            database_id: query.database ?? undefined,
            parameters: [],
            visualization_settings: {},
            id: newCardId,
            entity_id: "entity_id" as Card["entity_id"],
            created_at: "",
            updated_at: "",
            name: chart["chart-name"] ?? t`Exploration`,
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

          trackDocumentAskMetabot(document);
          await dispatch(loadMetadataForDocumentCard(card));

          dispatch(
            createDraftCard({
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
        ...cards.map(({ cardId, description }) => {
          return [
            wrapCardEmbed({
              type: "cardEmbed",
              attrs: {
                id: cardId,
              },
            }),
            {
              type: "paragraph",
              content: [createTextNode(description)],
            },
          ];
        }),
        {
          type: "paragraph",
          content: padWithUnstyledText(
            createTextNode(t`Created with Metabot`, [
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
        return t`Metabot is disabled`;
      }
      return isLoading ? t`Stop generating` : null;
    }, [isMetabotEnabled, isLoading]);

    return (
      <NodeViewWrapper>
        <Flex
          bg="background-secondary"
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
              <Icon name="metabot" data-show-on-print />
            </Button>
          </Box>
          <Flex flex={1} direction="column" className={S.contentWrapper}>
            <Box
              className={S.placeholder}
              hidden={!!node.content.content.length}
              contentEditable={false}
            >
              {t`Ask Metabot to generate a chart for you, type @ to mention items`}
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
                  className={
                    PLUGIN_METABOT.MetabotThinkingStyles.toolCallStarted
                  }
                >
                  {t`Working on it...`}
                </Text>
              ) : errorMessages.length > 0 ? (
                <Flex gap="sm" c="text-secondary">
                  <Icon name="warning" h="1.2rem" className={S.iconShrink} />
                  <Text c="text-secondary" lh={1.4}>
                    {errorMessages.map((error) => error.message).join("\n")}
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
