import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import CS from "metabase/css/core/index.css";
import { Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { useLazyMetabotDocumentNodeQuery } from "metabase-enterprise/api/metabot";
import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase-enterprise/documents/documents.slice";
import { useDocumentsDispatch } from "metabase-enterprise/documents/redux-utils";
import MetabotThinkingStyles from "metabase-enterprise/metabot/components/MetabotChat/MetabotThinking.module.css";
import type { Card, MetabotDocumentNodeRequest } from "metabase-types/api";

import Styles from "./MetabotEmbed.module.css";

const createTextNode = (str: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: str }],
});

export type PromptSerializer = (
  node: ProseMirrorNode,
) => MetabotDocumentNodeRequest;

const serializePromptDefault: PromptSerializer = (node) => ({
  instructions: node.textContent,
});

export const MetabotNode = Node.create<{
  serializePrompt?: PromptSerializer;
}>({
  name: "metabot",
  group: "block",
  content: "inline*",
  marks: "",
  draggable: true,
  selectable: false,

  addOptions() {
    return {
      serializePrompt: serializePromptDefault,
    };
  },

  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // newline on Enter
      Enter: ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }
        return editor.commands.setHardBreak();
      },

      // run metabot on mod-Enter
      "mod-Enter": ({ editor }) => {
        const { state } = editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty || $from.parent.type !== this.type) {
          return false;
        }
        const targetId = $from.parent.attrs.id;
        if (targetId) {
          editor.emit("runMetabot", targetId);
        }
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
    return ReactNodeViewRenderer(MetabotComponent);
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "metabot",
        "data-text": node.attrs.text,
      }),
      0,
    ];
  },
});

export const MetabotComponent = memo(
  ({
    editor,
    getPos,
    deleteNode,
    node,
    updateAttributes,
    extension,
  }: NodeViewProps) => {
    const documentsDispatch = useDocumentsDispatch();
    const controllerRef = useRef<AbortController | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [queryMetabot] = useLazyMetabotDocumentNodeQuery();

    const id = useUniqueId();
    useEffect(() => {
      setTimeout(() => {
        updateAttributes({ id });
      }, 10); // setTimeout prevents `flushSync was called from inside a lifecycle method` error
    }, [updateAttributes, id]);

    const handleRunMetabot = async () => {
      const serializePrompt =
        extension?.options?.serializePrompt || serializePromptDefault;
      const payload = serializePrompt(node);

      if (!payload.instructions.trim()) {
        return;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setErrorText("");
      editor.commands.focus();

      const res = queryMetabot(payload);
      controller.signal.addEventListener("abort", () => res.abort());
      const { data, error } = await res;
      if (controller.signal.aborted) {
        return;
      }

      setIsLoading(false);

      if (error || !data?.draft_card) {
        setErrorText(
          data?.error || t`There was a problem connecting to Metabot`,
        );
        return;
      }

      const nodePosition = getPos();

      if (nodePosition == null) {
        setErrorText(t`Could not find Metabot block`);
        return;
      }

      const newCardId = generateDraftCardId();
      const card: Card = {
        ...data.draft_card,
        id: newCardId,
        entity_id: "entity_id" as Card["entity_id"],
        created_at: "",
        updated_at: "",
        name: data.draft_card.name || t`Exploration`,
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

      await documentsDispatch(loadMetadataForDocumentCard(card));

      documentsDispatch(
        createDraftCard({
          originalCard: card,
          modifiedData: {},
          draftId: newCardId,
        }),
      );

      editor.commands.insertContentAt(nodePosition, [
        {
          type: "cardEmbed",
          attrs: {
            id: newCardId,
          },
        },
        createTextNode(data.description),
        createTextNode(`🤖 ${t`Created with Metabot`} 💙`),
      ]);

      deleteNode();
    };

    const handleStopMetabot = () => {
      controllerRef.current?.abort();
      setIsLoading(false);
      setErrorText("");
    };

    const onRunMetabotRef = useLatest((targetId: string) => {
      if (targetId === id) {
        handleRunMetabot();
      }
    });
    useEffect(() => {
      const onRunMetabot = (targetId: string) => {
        onRunMetabotRef.current(targetId);
      };
      editor.on("runMetabot", onRunMetabot);
      return () => {
        editor.off("runMetabot", onRunMetabot);
      };
    }, [editor, onRunMetabotRef]);

    return (
      <NodeViewWrapper>
        <Flex
          bg="bg-light"
          bd="1px solid var(--border-color)"
          style={{ borderRadius: "4px" }}
          pos="relative"
          direction="column"
          mb="1rem"
        >
          <Button
            variant="subtle"
            pos="absolute"
            top={0}
            right={0}
            p="sm"
            m="sm"
            size="sm"
            opacity="0.5"
            style={{ zIndex: 1 }}
            onClick={() => deleteNode()}
          >
            <Icon name="close" />
          </Button>
          <Flex flex={1} direction="column" style={{ overflow: "auto" }}>
            <Box
              className={Styles.placeholder}
              hidden={!!node.content.content.length}
            >
              {t`Ask Metabot to generate a chart for you, and use @ to select a specific Database to use`}
            </Box>
            <NodeViewContent
              contentEditable={!isLoading}
              className={Styles.codeBlockTextArea}
            />
          </Flex>
          <Flex px="md" pb="md" pt="sm" gap="sm">
            <Flex flex={1} my="auto">
              {isLoading ? (
                <Text
                  flex={1}
                  className={MetabotThinkingStyles.toolCallStarted}
                >
                  {t`Working on it...`}
                </Text>
              ) : errorText ? (
                <Flex gap="sm" c="text-secondary">
                  <Icon name="warning" h="1.2rem" style={{ flexShrink: 0 }} />
                  <Text c="text-secondary" lh={1.4}>
                    {errorText}
                  </Text>
                </Flex>
              ) : null}
            </Flex>
            <Tooltip
              label={t`Stop generating`}
              disabled={!isLoading}
              position="bottom"
            >
              <Button
                size="sm"
                onClick={() =>
                  isLoading ? handleStopMetabot() : handleRunMetabot()
                }
                classNames={{
                  label: CS.flex, // ensures icon is vertically centered
                }}
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
