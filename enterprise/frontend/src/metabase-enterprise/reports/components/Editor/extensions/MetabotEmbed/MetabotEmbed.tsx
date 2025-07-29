import { Node, mergeAttributes } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Button, Flex, Icon } from "metabase/ui";

import { useMetabotReportQuery } from "../../hooks/useMetabotReportQuery";

import Styles from "./MetabotEmbed.module.css";

export interface MetabotAttributes {
  status: string;
  text: string;
}

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
      status: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-status"),
      },
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
          "data-status": node.attrs.status,
          "data-text": node.attrs.text,
        },
        this.options.HTMLAttributes,
      ),
      `{{ metabot:${node.attrs.status}:${node.attrs.text} }}`,
    ];
  },

  renderText({ node }) {
    return `{{ metabot:${node.attrs.status}:${node.attrs.text} }}`;
  },
});

export const MetabotComponent = memo(
  ({ editor, getPos, deleteNode }: NodeViewProps) => {
    const [prompt, setPrompt] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const queryMetabot = useMetabotReportQuery();

    const handleRunMetabot = useCallback(async () => {
      setIsLoading(true);
      editor.commands.focus();

      const { cardId, snapshotId, description, title } = await queryMetabot({
        prompt: prompt.trim(),
      });

      setIsLoading(false);
      const nodePosition = getPos();

      const scrollId = `scroll-${_.uniqueId()}`;
      editor
        .chain()
        .insertContentAt(nodePosition, {
          type: "cardEmbed",
          attrs: {
            snapshotId,
            cardId,
            questionName: title,
            model: "question",
            scrollId,
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
          inputRef.current.focus();
        }, 50); // Small delay to ensure focus is set after rendering
      }
    }, [inputRef]);

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
          p="md"
          bg="bg-light"
          bd="1px solid var(--border-color)"
          style={{ borderRadius: "4px" }}
        >
          <textarea
            disabled={isLoading}
            ref={inputRef}
            className={Styles.codeBlockTextArea}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t`Can you show me monthly sales data for the past year in a line chart?`}
          />
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
      prevProps.node.attrs.status === nextProps.node.attrs.status &&
      prevProps.selected === nextProps.selected
    );
  },
);

MetabotComponent.displayName = "MetabotComponent";
