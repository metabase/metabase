import { type JSONContent, Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { trackDocumentAskMetabot } from "metabase/documents/analytics";
import {
  createDraftCard,
  generateDraftCardId,
  loadMetadataForDocumentCard,
} from "metabase/documents/documents.slice";
import { getCurrentDocument } from "metabase/documents/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import type { Card, MetabotGenerateContentRequest } from "metabase-types/api";

import { wrapCardEmbed } from "../shared/layout";

import S from "./MetabotEmbed.module.css";

declare module "@tiptap/core" {
  interface EditorEvents {
    runMetabot: ProseMirrorNode; // the metabot node in the AST
  }
}

const createTextNode = (text: string, marks?: JSONContent["marks"]) => {
  return { type: "text", text, marks };
};

// unsets bold/italic/etc when user edits around `content`
const padWithUnstyledText = (content: JSONContent): JSONContent[] => [
  createTextNode(" "),
  content,
  createTextNode(" "),
];

export type PromptSerializer = (
  node: ProseMirrorNode,
) => MetabotGenerateContentRequest;

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
  code: true, // disallows adding markdown (headings, blockquote, etc) to metabot block

  addOptions() {
    return {
      serializePrompt: serializePromptDefault,
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
    return ReactNodeViewRenderer(MetabotComponent);
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

export const MetabotComponent = memo(
  ({ editor, getPos, deleteNode, node, extension }: NodeViewProps) => {
    const dispatch = useDispatch();
    const document = useSelector(getCurrentDocument);
    const controllerRef = useRef<AbortController | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [queryMetabot] = PLUGIN_METABOT.useLazyMetabotGenerateContentQuery();
    const isMetabotEnabled = PLUGIN_METABOT.isEnabled();

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

      trackDocumentAskMetabot(document);
      await dispatch(loadMetadataForDocumentCard(card));

      dispatch(
        createDraftCard({
          originalCard: card,
          modifiedData: {},
          draftId: newCardId,
        }),
      );

      editor.commands.insertContentAt(nodePosition, [
        wrapCardEmbed({
          type: "cardEmbed",
          attrs: {
            id: newCardId,
          },
        }),
        {
          type: "paragraph",
          content: [createTextNode(data.description)],
        },
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

    const handleStopMetabot = () => {
      controllerRef.current?.abort();
      setIsLoading(false);
      setErrorText("");
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
            {editor.options.editable ? (
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
            ) : (
              <Box p="md">
                <Icon name="metabot" />
              </Box>
            )}
          </Box>
          <Flex flex={1} direction="column" className={S.contentWrapper}>
            <Box
              className={S.placeholder}
              hidden={!!node.content.content.length}
              contentEditable={false}
            >
              {t`Ask Metabot to generate a chart for you, and use @ to select a specific Database to use`}
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
              ) : errorText ? (
                <Flex gap="sm" c="text-secondary">
                  <Icon name="warning" h="1.2rem" className={S.iconShrink} />
                  <Text c="text-secondary" lh={1.4}>
                    {errorText}
                  </Text>
                </Flex>
              ) : null}
            </Flex>
            {editor.options.editable && (
              <Tooltip
                label={tooltip}
                disabled={tooltip == null}
                position="bottom"
              >
                <Button
                  size="sm"
                  disabled={!isMetabotEnabled}
                  onClick={() =>
                    isLoading ? handleStopMetabot() : handleRunMetabot()
                  }
                  classNames={{
                    label: CS.flex, // ensures icon is vertically centered
                  }}
                  data-hide-on-print
                >
                  {isLoading ? <Icon name="close" /> : t`Run`}
                </Button>
              </Tooltip>
            )}
          </Flex>
        </Flex>
      </NodeViewWrapper>
    );
  },
);

MetabotComponent.displayName = "MetabotComponent";
