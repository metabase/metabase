import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon } from "metabase/ui";

import { useMetabotDocumentQuery } from "../../hooks/useMetabotDocumentQuery";

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
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorText, setErrorText] = useState("");
    const queryMetabot = useMetabotDocumentQuery();
    const { text: prompt } = node.attrs;

    const handleRunMetabot = useCallback(async () => {
      setIsLoading(true);
      setErrorText("");
      editor.commands.focus();

      const { cardId, description, error } = await queryMetabot({
        prompt: prompt.trim(),
      });

      setIsLoading(false);

      if (error) {
        setErrorText(error);
        return;
      }

      const nodePosition = getPos();

      if (nodePosition == null) {
        setErrorText(t`Could not find Metabot block`);
        return;
      }

      editor
        .chain()
        .insertContentAt(nodePosition, {
          type: "cardEmbed",
          attrs: {
            id: cardId,
          },
        })
        .insertContentAt(
          nodePosition + 1,
          createTextNode(`🤖 Created with Metabot 💙`),
        )
        .insertContentAt(nodePosition + 1, createTextNode(description))
        .run();

      deleteNode();
    }, [prompt, editor, queryMetabot, deleteNode, getPos]);

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
          p="sm"
          bg="bg-light"
          bd="1px solid var(--border-color)"
          gap="sm"
          style={{ borderRadius: "4px" }}
          pos="relative"
        >
          <Button
            variant="subtle"
            pos="absolute"
            top={0}
            right={0}
            p="sm"
            size="sm"
            opacity="0.5"
            onClick={() => deleteNode()}
          >
            <Icon name="close" />
          </Button>
          <Box w="100%">
            <textarea
              disabled={isLoading}
              ref={inputRef}
              className={Styles.codeBlockTextArea}
              value={prompt}
              onChange={(e) => updateAttributes({ text: e.target.value })}
              placeholder={t`Can you show me monthly sales data for the past year in a line chart?`}
            />
            {errorText && (
              <Flex align="center" gap="sm">
                <Icon name="warning" style={{ flexShrink: 0 }} />
                {errorText}
              </Flex>
            )}
          </Box>
          <Flex direction="column" justify="end" style={{ flexShrink: 0 }}>
            <Button
              size="compact"
              variant="filled"
              leftSection={<Icon name="play" />}
              onClick={() => handleRunMetabot()}
              loading={isLoading}
            >
              {t`Run`}
            </Button>
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
