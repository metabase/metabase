import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { Node } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { t } from "ttag";

import { Box, Button, Group, Paper, Stack, Text, useMantineTheme } from "metabase/ui";
import { Icon } from "metabase/ui";
import { useSearchQuery } from "metabase/api";
import { skipToken } from "@reduxjs/toolkit/query";
import Visualization from "metabase/visualizations/components/Visualization";
import { MantineProvider } from "@mantine/core";
import { ThemeProvider } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { useContext } from "react";
import { MetabaseReduxContext } from "metabase/lib/redux";

import { MentionSuggestions } from "./MentionSuggestions";
import {
  EditorContainer,
  EditorToolbar,
  ToolbarButton,
  StyledEditorContent,
} from "./ReportEditor.styled";

// Wrapper component that provides Mantine theme and Redux context
const VisualizationNodeWithProviders = ({ node, store }: { node: any; store: any }) => {
  return (
    <MetabaseReduxProvider store={store}>
      <ThemeProvider>
        <VisualizationNode node={node} />
      </ThemeProvider>
    </MetabaseReduxProvider>
  );
};

// React component for the visualization node
const VisualizationNode = ({ node }: { node: any }) => {
  console.log('VisualizationNode component rendering with node:', node);

  const [cardData, setCardData] = useState<any>(null);
  const [queryResult, setQueryResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    useEffect(() => {
    const fetchCardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { model, id } = node.attrs;
        console.log('Fetching data for:', { model, id });
        console.log('Full node attrs:', node.attrs);

                // Skip dashboards for now
        if (model === 'dashboard') {
          console.log('Skipping dashboard');
          setError('Dashboard visualizations not supported yet');
          return;
        }

        let card;

        if (model === 'table') {
          // For tables, we need to fetch table metadata and create a card-like object
          console.log('Fetching table metadata from:', `/api/table/${id}`);
          const tableResponse = await fetch(`/api/table/${id}`);
          console.log('Table response status:', tableResponse.status);

          if (!tableResponse.ok) {
            throw new Error(`Failed to fetch table: ${tableResponse.statusText}`);
          }

          const table = await tableResponse.json();
          console.log('Table data:', table);

          // Create a card-like object for the table
          card = {
            id: table.id,
            name: table.display_name || table.name,
            display: 'table',
            database_id: table.db_id,
            dataset_query: {
              database: table.db_id,
              type: 'query',
              query: {
                'source-table': table.id
              }
            },
            visualization_settings: {
              'table.pivot': false,
              'table.column_formatting': []
            }
          };
        } else {
          // For cards, fetch card data from the API
          console.log('Fetching card data from:', `/api/card/${id}`);
          const cardResponse = await fetch(`/api/card/${id}`);
          console.log('Card response status:', cardResponse.status);

          if (!cardResponse.ok) {
            throw new Error(`Failed to fetch card: ${cardResponse.statusText}`);
          }

          card = await cardResponse.json();
          console.log('Card data:', card);
          console.log('Card display type:', card.display);
          console.log('Card dataset_query:', card.dataset_query);
        }

        setCardData(card);

                                // Handle different model types
        if (model === 'card') {
          // For saved questions/cards, fetch the query result
          console.log('Fetching query results from:', `/api/card/${id}/query`);
          const queryResponse = await fetch(`/api/card/${id}/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ignore_cache: false,
              parameters: []
            })
          });
          console.log('Query response status:', queryResponse.status);

          if (!queryResponse.ok) {
            throw new Error(`Failed to fetch query results: ${queryResponse.statusText}`);
          }

          const queryData = await queryResponse.json();
          console.log('Query data:', queryData);
          console.log('Query data structure:', {
            hasData: !!queryData.data,
            hasCols: !!queryData.data?.cols,
            hasRows: !!queryData.data?.rows,
            colsLength: queryData.data?.cols?.length,
            rowsLength: queryData.data?.rows?.length,
            topLevelKeys: Object.keys(queryData),
            hasTopLevelCols: !!queryData.cols,
            hasTopLevelRows: !!queryData.rows,
            topLevelColsLength: queryData.cols?.length,
            topLevelRowsLength: queryData.rows?.length
          });
          setQueryResult(queryData);
        } else if (model === 'table') {
          // For raw tables, we need to create a simple table query using the dataset endpoint
          console.log('Creating table query for table ID:', id);
          const tableQueryResponse = await fetch(`/api/dataset`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              database: card.database_id,
              type: 'query',
              query: {
                'source-table': id,
                limit: 100
              }
            })
          });

          if (!tableQueryResponse.ok) {
            throw new Error(`Failed to fetch table data: ${tableQueryResponse.statusText}`);
          }

          const tableData = await tableQueryResponse.json();
          console.log('Table data:', tableData);
          console.log('Table data structure:', {
            hasData: !!tableData.data,
            hasCols: !!tableData.data?.cols,
            hasRows: !!tableData.data?.rows,
            colsLength: tableData.data?.cols?.length,
            rowsLength: tableData.data?.rows?.length,
            topLevelKeys: Object.keys(tableData),
            hasTopLevelCols: !!tableData.cols,
            hasTopLevelRows: !!tableData.rows,
            topLevelColsLength: tableData.cols?.length,
            topLevelRowsLength: tableData.rows?.length
          });
          setQueryResult(tableData);
        }
      } catch (err) {
        console.error('Error fetching card data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (node.attrs.id) {
      fetchCardData();
    } else {
      console.log('No ID found in node attrs:', node.attrs);
    }
  }, [node.attrs.id]);

  if (loading) {
    return (
      <Box
        style={{
          border: "2px solid #4285f4",
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
          border: "2px solid #ea4335",
          borderRadius: "8px",
          backgroundColor: "#fef7f0",
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
          border: "2px solid #fbbc04",
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

  // Skip dashboards
  if (node.attrs.model === 'dashboard') {
    return (
      <Box
        style={{
          border: "2px solid #9aa0a6",
          borderRadius: "8px",
          backgroundColor: "#f8f9fa",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "100px",
        }}
      >
        <Text
          size="sm"
          color="dimmed"
          style={{ marginBottom: "0.5rem", fontWeight: "bold" }}
        >
          {node.attrs.name} (Dashboard)
        </Text>
        <Text size="sm" color="dimmed">
          Dashboard visualizations not supported yet
        </Text>
      </Box>
    );
  }

    // For cards and tables, render the actual visualization
  if ((node.attrs.model === 'card' || node.attrs.model === 'table') && queryResult && cardData) {
    const displayType = node.attrs.model === 'table' ? 'table' : cardData.display;

        const dataToSpread = queryResult.data || queryResult;
    console.log('Data to spread:', dataToSpread);
    console.log('Data to spread structure:', {
      hasData: !!dataToSpread.data,
      hasCols: !!dataToSpread.cols,
      hasRows: !!dataToSpread.rows,
      topLevelKeys: Object.keys(dataToSpread),
      colsLength: dataToSpread.cols?.length,
      rowsLength: dataToSpread.rows?.length
    });

    const rawSeries = [{
      ...dataToSpread,  // Spread the query result data
      card: {
        ...cardData,
        display: displayType,
        visualization_settings: {
          ...cardData.visualization_settings,
          ...(node.attrs.model === 'table' && {
            'table.pivot': false,
            'table.column_formatting': []
          })
        }
      },
      started_at: new Date().toISOString()
    }];

    console.log('About to render visualization with rawSeries:', rawSeries);
    console.log('Data structure check:', {
      hasCard: !!rawSeries[0].card,
      hasData: !!rawSeries[0].data,
      hasCols: !!rawSeries[0].cols,
      hasRows: !!rawSeries[0].rows,
      displayType: rawSeries[0].card.display,
      colsCount: rawSeries[0].cols?.length,
      rowsCount: rawSeries[0].rows?.length
    });

    return (
      <Box
        style={{
          border: "2px solid #34a853",
          borderRadius: "8px",
          backgroundColor: "#ffffff",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "300px",
        }}
      >
        <Text
          size="sm"
          color="dimmed"
          style={{ marginBottom: "1rem", fontWeight: "bold" }}
        >
          {node.attrs.name} ({node.attrs.model}) - Display: {displayType}
        </Text>
                <Box style={{ height: "400px", width: "100%" }}>
          <Visualization
            rawSeries={rawSeries}
            isDashboard={false}
            width={600}
            height={400}
            showTitle={false}
            handleVisualizationClick={() => {}}
          />
        </Box>
      </Box>
    );
  }

  // Fallback for other types
  return (
    <Box
      style={{
        border: "2px solid #9aa0a6",
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
      <Text size="sm" color="dimmed">
        Visualization type not supported yet
      </Text>
    </Box>
  );
};

// Function to create the custom extension with store
const createMetabaseVisualizationExtension = (store: any) => {
  return Node.create({
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
            root.render(React.createElement(VisualizationNodeWithProviders, { node, store }));
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
            root.render(React.createElement(VisualizationNodeWithProviders, { node: updatedNode, store }));
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
};

const ReportEditor = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionCommand, setMentionCommand] = useState<((item: any) => void) | null>(null);
  const [mentionRect, setMentionRect] = useState(null);

  // Get the current theme and store to pass to node views
  const theme = useMantineTheme();
  // Access the global store from window.Metabase.store
  const store = (window as any).Metabase?.store;

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
      ...(store ? [createMetabaseVisualizationExtension(store)] : []),
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
            console.log('Search results:', searchResults?.data);
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
    <Paper maw={800} m="lg">
    <StyledEditorContent>
        <EditorContent editor={editor} />
      </StyledEditorContent>
    </Paper>


      {showMentions && mentionRect && (
        <MentionSuggestions
          items={searchResults?.data || []}
          command={mentionCommand}
          clientRect={mentionRect}
        />
      )}
    </EditorContainer>
  );
};

export default ReportEditor;
