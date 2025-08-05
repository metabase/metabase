import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { useLazyMetabotDocumentNodeQuery } from "metabase-enterprise/api/metabot";
import {
  createDraftCard,
  generateDraftCardId,
} from "metabase-enterprise/documents/documents.slice";
import { useDocumentsDispatch } from "metabase-enterprise/documents/redux-utils";
import MetabotThinkingStyles from "metabase-enterprise/metabot/components/MetabotChat/MetabotThinking.module.css";

import Styles from "./MetabotEmbed.module.css";

const createTextNode = (str: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: str }],
});

export const MetabotNode = Node.create<{
  HTMLAttributes: Record<string, unknown>;
}>({
  name: "metabot",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-text"),
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
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "metabot",
          "data-text": node.attrs.text,
        },
        this.options.HTMLAttributes,
      ),
      `{{ metabot:${node.attrs.text} }}`,
    ];
  },

  renderText({ node }) {
    return `{{ metabot:${node.attrs.text} }}`;
  },
});

export const MetabotComponent = memo(
  ({ editor, getPos, deleteNode, updateAttributes, node }: NodeViewProps) => {
    const documentsDispatch = useDocumentsDispatch();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorText, setErrorText] = useState("");
    const [queryMetabot] = useLazyMetabotDocumentNodeQuery();
    const { text: prompt } = node.attrs;

    const handleRunMetabot = useCallback(async () => {
      if (!prompt?.trim()) {
        return;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsLoading(true);
      setErrorText("");
      editor.commands.focus();

      const res = queryMetabot({ prompt: prompt.trim() });
      // TODO: Wire up "Stop generating" with res.abort();
      const { data, error } = await res;

      setIsLoading(false);

      // TODO: Figure out actual error handling
      if (error || !data?.card) {
        setErrorText(
          data?.message || t`There was a problem connecting to Metabot`,
        );
        return;
      }

      const nodePosition = getPos();

      if (nodePosition == null) {
        setErrorText(t`Could not find Metabot block`);
        return;
      }
      const newCardId = generateDraftCardId();
      documentsDispatch(
        createDraftCard({
          originalCard: data.card,
          modifiedData: {},
          draftId: newCardId,
        }),
      );

      editor
        .chain()
        .insertContentAt(nodePosition, {
          type: "cardEmbed",
          attrs: {
            id: newCardId,
          },
        })
        .insertContentAt(
          nodePosition + 1,
          createTextNode(`🤖 Created with Metabot 💙`),
        )
        .insertContentAt(nodePosition + 1, createTextNode(data.message))
        .run();

      deleteNode();
    }, [prompt, editor, queryMetabot, deleteNode, getPos, documentsDispatch]);

    const handleStopMetabot = () => {
      controllerRef.current?.abort();
      setIsLoading(false);
      setErrorText("");
    };

    useEffect(() => {
      // Grab focus from TipTap editor and put it in textarea when component mounts
      if (inputRef.current) {
        setTimeout(() => {
          inputRef.current?.focus();
          const unfocus = (e: KeyboardEvent) => {
            if (e.key === "Tab") {
              inputRef.current?.blur();
              editor.commands.focus();
            }
          };

          inputRef.current?.addEventListener("keydown", unfocus);
          return () =>
            inputRef.current?.removeEventListener("keydown", unfocus);
        }, 50); // Small delay to ensure focus is set after rendering
      }
    }, [inputRef, editor.commands]);

    useEffect(() => {
      const currentInput = inputRef.current;
      if (currentInput) {
        const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            handleRunMetabot();
          }
        };
        currentInput.addEventListener("keydown", handleKeyDown);
        return () => {
          currentInput.removeEventListener("keydown", handleKeyDown);
        };
      }
    }, [handleRunMetabot]);

    return (
      <NodeViewWrapper as="span">
        <Flex
          bg="bg-light"
          bd="1px solid var(--border-color)"
          style={{ borderRadius: "4px" }}
          pos="relative"
          h={180}
          direction="column"
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
            onClick={() => deleteNode()}
          >
            <Icon name="close" />
          </Button>
          <Flex flex={1} direction="column" style={{ overflow: "auto" }}>
            <textarea
              disabled={isLoading}
              ref={inputRef}
              className={Styles.codeBlockTextArea}
              value={prompt || ""}
              onChange={(e) => updateAttributes({ text: e.target.value })}
              placeholder={t`Can you show me monthly sales data for the past year in a line chart?`}
            />
          </Flex>
          <Flex px="md" pb="md" pt="xs" gap="sm">
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
  (prevProps, nextProps) => {
    return (
      prevProps.node.attrs.text === nextProps.node.attrs.text &&
      prevProps.selected === nextProps.selected
    );
  },
);

MetabotComponent.displayName = "MetabotComponent";
