import { Node, mergeAttributes } from "@tiptap/core";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useGetCardQuery } from "metabase/api";
import { CardApi } from "metabase/services";
import { Box, Icon, Loader, Menu, Text, TextInput } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";

import styles from "./QuestionEmbedNode.module.css";

export interface QuestionEmbedAttributes {
  questionId: number;
  questionName: string;
  customName?: string;
  model: string;
}

export const QuestionEmbedNode = Node.create<{
  HTMLAttributes: Record<string, any>;
}>({
  name: "questionEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      questionId: {
        default: null,
        parseHTML: (element) =>
          parseInt(element.getAttribute("data-question-id") || "0"),
      },
      questionName: {
        default: "",
      },
      customName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-custom-name"),
      },
      model: {
        default: "card",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="question-embed"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        {
          "data-type": "question-embed",
          "data-question-id": node.attrs.questionId,
          "data-question-name": node.attrs.questionName,
          "data-model": node.attrs.model,
        },
        this.options.HTMLAttributes,
      ),
      node.attrs.customName
        ? `{{card:${node.attrs.questionId}:${node.attrs.customName}}}`
        : `{{card:${node.attrs.questionId}}}`,
    ];
  },

  renderText({ node }) {
    if (node.attrs.customName) {
      return `{{card:${node.attrs.questionId}:${node.attrs.customName}}}`;
    }
    return `{{card:${node.attrs.questionId}}}`;
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("div");
      dom.setAttribute("data-type", "question-embed");
      dom.className = styles.embedContainer;

      const content = document.createElement("div");
      dom.appendChild(content);

      return {
        dom,
        contentDOM: content,
      };
    };
  },
});

export const QuestionEmbedComponent = ({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: NodeViewProps) => {
  const { questionId, questionName, customName } = node.attrs;
  const { data: card, isLoading, error } = useGetCardQuery({ id: questionId });
  const [results, setResults] = useState<any>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(customName || "");
  const titleInputRef = useRef<HTMLInputElement>(null);

  const displayName = customName || card?.name || questionName;

  useEffect(() => {
    if (card?.id) {
      CardApi.query({ cardId: card.id })
        .then((data) => setResults(data))
        .catch((err) => console.error("Failed to load question results:", err));
    }
  }, [card?.id]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSave = () => {
    const trimmedTitle = editedTitle.trim();
    if (trimmedTitle && trimmedTitle !== card?.name) {
      updateAttributes({ customName: trimmedTitle });
    } else {
      updateAttributes({ customName: null });
      setEditedTitle("");
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === "Escape") {
      setEditedTitle(customName || "");
      setIsEditingTitle(false);
    }
  };

  const handleReplaceQuestion = () => {
    // Get the position of this node in the editor
    const pos = editor.state.doc.nodeAt(0) ? getPos() : 0;

    if (typeof pos === "number") {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: pos, to: pos + node.nodeSize })
        .deleteSelection()
        .insertContent("@")
        .run();
    }
  };

  if (isLoading) {
    return (
      <NodeViewWrapper className={styles.embedWrapper}>
        <Box className={styles.loadingContainer}>
          <Loader size="sm" />
          <Text>Loading question...</Text>
        </Box>
      </NodeViewWrapper>
    );
  }

  if (error) {
    return (
      <NodeViewWrapper className={styles.embedWrapper}>
        <Box className={styles.errorContainer}>
          <Text color="error">{t`Failed to load question: {questionName}`}</Text>
        </Box>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={styles.embedWrapper}>
      <Box
        className={`${styles.questionEmbed} ${selected ? styles.selected : ""}`}
      >
        {card && (
          <Box className={styles.questionHeader}>
            <Box
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              {isEditingTitle ? (
                <TextInput
                  ref={titleInputRef}
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  size="md"
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      fontWeight: 700,
                      fontSize: "1rem",
                      border: "1px solid transparent",
                      padding: 0,
                      height: "auto",
                      minHeight: "auto",
                      lineHeight: 1.55,
                      backgroundColor: "transparent",
                      "&:focus": {
                        border: "1px solid var(--mb-color-border)",
                        backgroundColor: "var(--mb-color-bg-white)",
                        padding: "0 0.25rem",
                      },
                    },
                  }}
                />
              ) : (
                <Text
                  size="md"
                  color="text-dark"
                  weight={700}
                  onClick={() => {
                    setEditedTitle(displayName);
                    setIsEditingTitle(true);
                  }}
                  style={{ cursor: "pointer", flex: 1 }}
                >
                  {displayName}
                </Text>
              )}
              {!isEditingTitle && (
                <Menu withinPortal position="bottom-end">
                  <Menu.Target>
                    <Box
                      component="button"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "0.25rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "4px",
                      }}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      <Icon
                        name="ellipsis"
                        size={16}
                        color="var(--mb-color-text-medium)"
                      />
                    </Box>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={handleReplaceQuestion}>
                      {t`Replace question`}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              )}
            </Box>
          </Box>
        )}
        {results && card ? (
          <Box className={styles.questionResults}>
            <Visualization
              rawSeries={[{ card, data: results.data }]}
              isEditing={false}
              isDashboard={false}
            />
          </Box>
        ) : (
          <Box className={styles.loadingContainer}>
            <Loader size="sm" />
            <Text>Loading results...</Text>
          </Box>
        )}
      </Box>
    </NodeViewWrapper>
  );
};
