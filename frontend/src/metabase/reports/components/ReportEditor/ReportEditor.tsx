import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Node } from "@tiptap/core";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui";
import { Icon } from "metabase/ui";
import { useSearchQuery } from "metabase/api";
import Visualization from "metabase/visualizations/components/Visualization";

import { MentionSuggestions } from "./MentionSuggestions";
import {
  EditorContainer,
  EditorToolbar,
  ToolbarButton,
  StyledEditorContent,
} from "./ReportEditor.styled";

// Custom extension for rendering Metabase visualizations
const MetabaseVisualization = Node.create({
  name: "metabaseVisualization",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
      },
      name: {
        default: null,
      },
      type: {
        default: null,
      },
      model: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='metabase-visualization']",
        getAttrs: (element) => {
          if (typeof element === "string") return {};
          return {
            id: element.getAttribute("data-id"),
            name: element.getAttribute("data-name"),
            type: element.getAttribute("data-type"),
            model: element.getAttribute("data-model"),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "metabase-visualization",
        "data-id": HTMLAttributes.id,
        "data-name": HTMLAttributes.name,
        "data-visualization-type": HTMLAttributes.type,
        "data-model": HTMLAttributes.model,
      },
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }: any) => {
      const dom = document.createElement("div");
      dom.className = "metabase-visualization-container";
      dom.setAttribute("data-type", "metabase-visualization");
      dom.setAttribute("data-id", node.attrs.id);
      dom.setAttribute("data-name", node.attrs.name);
      dom.setAttribute("data-type", node.attrs.type);
      dom.setAttribute("data-model", node.attrs.model);

      // Create a React component to render inside the DOM element
      const VisualizationComponent = () => {
        const [cardData, setCardData] = useState<any>(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState<string | null>(null);

        useEffect(() => {
          const fetchCardData = async () => {
            try {
              setLoading(true);
              // Fetch the card data from the API
              const response = await fetch(`/api/card/${node.attrs.id}`);
              if (!response.ok) {
                throw new Error("Failed to fetch card data");
              }
              const data = await response.json();
              setCardData(data);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
              setLoading(false);
            }
          };

          fetchCardData();
        }, [node.attrs.id]);

        if (loading) {
          return (
            <Box
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                backgroundColor: "#f8f9fa",
                margin: "1rem 0",
                padding: "1rem",
                minHeight: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text c="dimmed">{t`Loading visualization...`}</Text>
            </Box>
          );
        }

        if (error) {
          return (
            <Box
              style={{
                border: "1px solid #e0e0e0",
                borderRadius: "8px",
                backgroundColor: "#f8f9fa",
                margin: "1rem 0",
                padding: "1rem",
                minHeight: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text c="red">{t`Error loading visualization`}</Text>
            </Box>
          );
        }

        if (!cardData) {
          return null;
        }

        return (
          <Box
            style={{
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              backgroundColor: "#f8f9fa",
              margin: "1rem 0",
              padding: "1rem",
            }}
          >
            <Text size="sm" c="dimmed" mb="0.5rem">
              {node.attrs.name} ({node.attrs.type})
            </Text>
            <Box style={{ height: "300px" }}>
              <Visualization
                rawSeries={[{ card: cardData, data: cardData.result_metadata }]}
                isDashboard
              />
            </Box>
          </Box>
        );
      };

      // Render the React component into the DOM element using createPortal
      const renderVisualization = () => {
        const root = createPortal(<VisualizationComponent />, dom);
        return root;
      };

      const portal = renderVisualization();

      return {
        dom,
        contentDOM: null,
        update: (updatedNode: any) => {
          if (updatedNode.type !== node.type) {
            return false;
          }
          // Re-render the component if the node attributes changed
          renderVisualization();
          return true;
        },
        destroy: () => {
          // Cleanup if needed
        },
      };
    };
  },
});

const ReportEditor = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionCommand, setMentionCommand] = useState<((item: any) => void) | null>(null);
  const [mentionRect, setMentionRect] = useState(null);

  const { data: searchResults } = useSearchQuery(searchQuery, {
    enabled: searchQuery.length >= 2,
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: t`Start writing your report... Use @ to mention charts, tables, or other Metabase entities.`,
      }),
      MetabaseVisualization,
      Mention.configure({
        HTMLAttributes: {
          class: "mention",
        },
        suggestion: {
          char: "@",
          command: ({ editor, range, props }: any) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContentAt(range.from, [
                {
                  type: "metabaseVisualization",
                  attrs: {
                    id: props.id,
                    name: props.name,
                    type: props.type,
                    model: props.model,
                  },
                },
                {
                  type: "text",
                  text: " ",
                },
              ])
              .run();

            setShowMentions(false);
          },
          allow: ({ state, range }: any) => {
            const $from = state.doc.resolve(range.from);
            const type = state.schema.nodes.paragraph || state.schema.nodes.heading;
            const allow = !!type && $from.parent && type.validContent($from.parent.content);
            return allow;
          },
          items: ({ query }: any) => {
            if (query.length < 2) return [];
            setSearchQuery(query);
            return searchResults?.data || [];
          },
          render: () => {
            return {
              onStart: (props: any) => {
                setMentionCommand(() => props.command);
                setMentionRect(props.clientRect);
                setShowMentions(true);
              },
              onUpdate: (props: any) => {
                setMentionRect(props.clientRect);
              },
              onKeyDown: (props: any) => {
                if (props.event.key === "Escape") {
                  setShowMentions(false);
                  return true;
                }
                return false;
              },
              onExit: () => {
                setShowMentions(false);
                setMentionCommand(null);
                setMentionRect(null);
              },
            };
          },
        },
      }),
    ],
    content: "",
  });

  const handleSave = useCallback(() => {
    if (editor) {
      const content = editor.getHTML();
      console.log("Saving report content:", content);
      // TODO: Implement save functionality
    }
  }, [editor]);

  const handleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run();
  }, [editor]);

  const handleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run();
  }, [editor]);

  const handleStrike = useCallback(() => {
    editor?.chain().focus().toggleStrike().run();
  }, [editor]);

  const handleHeading = useCallback((level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  const handleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run();
  }, [editor]);

  const handleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const handleBlockquote = useCallback(() => {
    editor?.chain().focus().toggleBlockquote().run();
  }, [editor]);

  const handleCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run();
  }, [editor]);

  return (
    <EditorContainer>
      <EditorToolbar>
        <Group gap="xs">
          <ToolbarButton
            onClick={handleBold}
            title={t`Bold (Ctrl+B)`}
            data-testid="bold-button"
          >
            <Icon name="bolt" size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleItalic}
            title={t`Italic (Ctrl+I)`}
            data-testid="italic-button"
          >
            <Icon name="pencil" size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleStrike}
            title={t`Strikethrough`}
            data-testid="strike-button"
          >
            <Icon name="line" size={16} />
          </ToolbarButton>
        </Group>

        <Group gap="xs">
          <ToolbarButton
            onClick={() => handleHeading(1)}
            title={t`Heading 1`}
            data-testid="h1-button"
          >
            <Text size="sm" fw="bold">H1</Text>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => handleHeading(2)}
            title={t`Heading 2`}
            data-testid="h2-button"
          >
            <Text size="sm" fw="bold">H2</Text>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => handleHeading(3)}
            title={t`Heading 3`}
            data-testid="h3-button"
          >
            <Text size="sm" fw="bold">H3</Text>
          </ToolbarButton>
        </Group>

        <Group gap="xs">
          <ToolbarButton
            onClick={handleBulletList}
            title={t`Bullet List`}
            data-testid="bullet-list-button"
          >
            <Icon name="list" size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleOrderedList}
            title={t`Numbered List`}
            data-testid="ordered-list-button"
          >
            <Icon name="list" size={16} />
          </ToolbarButton>
        </Group>

        <Group gap="xs">
          <ToolbarButton
            onClick={handleBlockquote}
            title={t`Blockquote`}
            data-testid="blockquote-button"
          >
            <Icon name="info" size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={handleCodeBlock}
            title={t`Code Block`}
            data-testid="code-block-button"
          >
            <Icon name="sql" size={16} />
          </ToolbarButton>
        </Group>
      </EditorToolbar>

      <StyledEditorContent>
        <EditorContent editor={editor} />
      </StyledEditorContent>

      {showMentions && mentionRect && (
        <MentionSuggestions
          items={searchResults?.data || []}
          command={mentionCommand}
          clientRect={mentionRect}
        />
      )}

      <Box mt="md">
        <Button onClick={handleSave} variant="filled">
          {t`Save Report`}
        </Button>
      </Box>
    </EditorContainer>
  );
};

export default ReportEditor;
