import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { useEffect, useState, useRef } from "react";

import { useGetCardQuery } from "metabase/api";
import { CardApi } from "metabase/services";
import { Box, Loader, Text, TextInput } from "metabase/ui";
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

  addAttributes() {
    return {
      questionId: {
        default: null,
        parseHTML: element => parseInt(element.getAttribute("data-question-id") || "0"),
      },
      questionName: {
        default: "",
      },
      customName: {
        default: null,
        parseHTML: element => element.getAttribute("data-custom-name"),
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
    return ({ node }) => {
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

export const QuestionEmbedComponent = ({ node, updateAttributes }: NodeViewProps) => {
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
          <Text color="error">Failed to load question: {questionName}</Text>
        </Box>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={styles.embedWrapper}>
      <Box className={styles.questionEmbed}>
        {card && (
          <Box className={styles.questionHeader}>
            {isEditingTitle ? (
              <TextInput
                ref={titleInputRef}
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                size="md"
                styles={{
                  input: {
                    fontWeight: 700,
                    fontSize: "1rem",
                    border: "1px solid var(--mb-color-border)",
                    padding: "0.25rem 0.5rem",
                  }
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
                style={{ cursor: "pointer" }}
              >
                {displayName}
              </Text>
            )}
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
