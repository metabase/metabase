import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Node } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { t } from "ttag";

import { Box, Button, Group, Stack, Text } from "metabase/ui";
import { Icon } from "metabase/ui";
import { useSearchQuery } from "metabase/api";
import { skipToken } from "@reduxjs/toolkit/query";
import Visualization from "metabase/visualizations/components/Visualization";

import { MentionSuggestions } from "./MentionSuggestions";
import {
  EditorContainer,
  EditorToolbar,
  ToolbarButton,
  StyledEditorContent,
} from "./ReportEditor.styled";

// React component for the visualization node
const VisualizationNode = ({ node }: { node: any }) => {
  const [cardData, setCardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch card data from the API
        const response = await fetch(`/api/card/${node.attrs.id}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch card: ${response.statusText}`);
        }

        const data = await response.json();
        setCardData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (node.attrs.id) {
      fetchCardData();
    }
  }, [node.attrs.id]);

  if (loading) {
    return (
      <Box
        style={{
          border: "2px solid red",
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
        <Text>Loading visualization...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        style={{
          border: "2px solid red",
          borderRadius: "8px",
          backgroundColor: "#f8f9fa",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "200px",
        }}
      >
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  if (!cardData) {
    return (
      <Box
        style={{
          border: "2px solid red",
          borderRadius: "8px",
          backgroundColor: "#f8f9fa",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "200px",
        }}
      >
        <Text>No data available</Text>
      </Box>
    );
  }

  return (
    <Box
      style={{
        border: "2px solid red",
        borderRadius: "8px",
        backgroundColor: "#f8f9fa",
        margin: "1rem 0",
        padding: "1rem",
        minHeight: "200px",
      }}
    >
      <Text
        size="sm"
        color="dimmed"
        style={{ marginBottom: "0.5rem", fontWeight: "bold" }}
      >
        {node.attrs.name} ({node.attrs.type || node.attrs.model})
      </Text>
      <Box style={{ height: "300px", width: "100%" }}>
        <Visualization
          rawSeries={[{ card: cardData, data: cardData.result_metadata }]}
          isDashboard
          width={600}
          height={300}
        />
      </Box>
    </Box>
  );
};

// Custom extension for rendering Metabase visualizations
const MetabaseVisualization = Node.create({
  name: "metabaseVisualization",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

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
        "style": "border: 2px solid red; border-radius: 8px; background-color: #f8f9fa; margin: 1rem 0; padding: 1rem; min-height: 200px;",
      },
      0, // This means the content is not editable
    ];
  },

    addNodeView() {
    return ({ node, getPos, editor }: any) => {
      console.log("Creating React node view for:", node.attrs);

      const dom = document.createElement("div");
      dom.className = "metabase-visualization-container";
      dom.setAttribute("data-type", "metabase-visualization");
      dom.setAttribute("data-id", node.attrs.id);
      dom.setAttribute("data-name", node.attrs.name);
      dom.setAttribute("data-visualization-type", node.attrs.type);
      dom.setAttribute("data-model", node.attrs.model);

      // Set basic styling on the container
      dom.style.display = "block";
      dom.style.width = "100%";

      // Create React root and render component
      const root = createRoot(dom);

      const renderComponent = () => {
        try {
          root.render(React.createElement(VisualizationNode, { node }));
          console.log("React component rendered successfully");
        } catch (error) {
          console.error("Error rendering React component:", error);
          // Fallback to simple HTML if React fails
          dom.innerHTML = `
            <div style="border: 2px solid red; border-radius: 8px; background-color: #f8f9fa; margin: 1rem 0; padding: 1rem; min-height: 200px;">
              <div style="font-weight: bold; margin-bottom: 0.5rem;">
                ${node.attrs.name} (${node.attrs.type || node.attrs.model})
              </div>
              <div style="color: #666;">
                Error rendering React component - ID: ${node.attrs.id}
              </div>
            </div>
          `;
        }
      };

      // Initial render
      renderComponent();

      console.log("DOM element created:", dom.outerHTML);

      return {
        dom,
        contentDOM: null,
        update: (updatedNode: any) => {
          if (updatedNode.type !== node.type) {
            return false;
          }
          // Re-render with updated node
          try {
            root.render(React.createElement(VisualizationNode, { node: updatedNode }));
          } catch (error) {
            console.error("Error updating React component:", error);
          }
          return true;
        },
        destroy: () => {
          try {
            root.unmount();
          } catch (error) {
            console.error("Error unmounting React component:", error);
          }
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

  const { data: searchResults } = useSearchQuery(
    searchQuery.length >= 2 ? { q: searchQuery } : skipToken,
    {
      enabled: searchQuery.length >= 2,
    }
  );

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
            console.log("Mention command called with props:", props);
            console.log("Editor state before insertion:", editor.state.doc.toJSON());

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
                    type: props.model, // Use model as the type
                    model: props.model,
                  },
                },
                {
                  type: "text",
                  text: " ",
                },
              ])
              .run();

            console.log("Editor state after insertion:", editor.state.doc.toJSON());
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

      <Stack gap="md" mt="lg">
        <Group>
          <Button onClick={handleSave} variant="filled">
            {t`Save Report`}
          </Button>
        </Group>
      </Stack>
    </EditorContainer>
  );
};

export default ReportEditor;
