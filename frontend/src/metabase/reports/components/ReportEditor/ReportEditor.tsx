import { Node } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { skipToken } from "@reduxjs/toolkit/query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import Questions from "metabase/entities/questions";
import SavedQuestionLoader from "metabase/common/components/SavedQuestionLoader";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { Notebook } from "metabase/querying/notebook/components/Notebook/Notebook";
import { getSetting } from "metabase/selectors/settings";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { Box, Button, Flex, Group, Modal, Paper, Stack, Text, TextInput, useMantineTheme } from "metabase/ui";
import { Icon, ThemeProvider } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type Question from "metabase-lib/v1/Question";

import { updateEntities, runReport } from "../../store/reportSlice";
import {
  getReportEntityData,
  getReportEntityLoading,
  getReportEntityError,
  getIsReportRunning,
  getReportCanRun,
  getReportLastRunAt,
  getReportRunError,
  getReportResultsWithStatus
} from "../../store/selectors";

import { MentionSuggestions } from "./MentionSuggestions";
import { EntityResultModal } from "./EntityResultModal";
import {
  EditorContainer,
  EditorToolbar,
  ToolbarButton,
  StyledEditorContent,
} from "./ReportEditor.styled";

// Query Builder Modal Component using SavedQuestionLoader
const QueryBuilderModal = ({ entity, isOpen, onClose, onVisualize }: {
  entity: any;
  isOpen: boolean;
  onClose: () => void;
  onVisualize: (question: Question) => Promise<void>;
}) => {
  const reportTimezone = useSelector((state: any) => getSetting(state, "report-timezone-long"));
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="95%"
      title={`Edit Query: ${entity.name}`}
      styles={{
        content: {
          maxWidth: '95vw',
          maxHeight: '90vh',
          overflow: 'hidden'
        },
        body: {
          height: '80vh',
          padding: 0
        }
      }}
    >
      {entity.model === 'card' ? (
        <SavedQuestionLoader questionId={parseInt(entity.id)}>
          {({ question, loading, error }: { question: Question | null; loading: boolean; error: any }) => {
            if (loading) {
              return (
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Text>Loading question...</Text>
                </Box>
              );
            }

            if (error || !question) {
              return (
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Text color="red">Error loading question: {error?.toString()}</Text>
                </Box>
              );
            }

            return (
              <Box style={{ height: '100%', overflow: 'auto' }}>
                <Notebook
                  question={currentQuestion || question}
                  isDirty={true}
                  isRunnable={true}
                  isResultDirty={true}
                  reportTimezone={reportTimezone || "UTC"}
                  updateQuestion={async (updatedQuestion: Question) => {
                    setCurrentQuestion(updatedQuestion);
                    return Promise.resolve();
                  }}
                  runQuestionQuery={async () => {
                    // Use the current question state if available, fallback to original
                    const questionToSave = currentQuestion || question;
                    await onVisualize(questionToSave);
                  }}
                  hasVisualizeButton={true}
                />
              </Box>
            );
          }}
        </SavedQuestionLoader>
      ) : (
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Text>Query editing is only supported for questions/cards.</Text>
        </Box>
      )}
    </Modal>
  );
};

// Wrapper component that provides Mantine theme and Redux context
const VisualizationNodeWithProviders = ({ node, store, onOpenQueryBuilder }: { node: any; store: any; onOpenQueryBuilder?: (entityAttrs: any) => void }) => {
  return (
    <MetabaseReduxProvider store={store}>
      <ThemeProvider>
        <VisualizationNode node={node} onOpenQueryBuilder={onOpenQueryBuilder} />
      </ThemeProvider>
    </MetabaseReduxProvider>
  );
};

// React component for the visualization node
const VisualizationNode = ({ node, onOpenQueryBuilder }: { node: any; onOpenQueryBuilder?: (entityAttrs: any) => void }) => {
  console.log('VisualizationNode component rendering with node:', node);

  const entityId = node.attrs.id;
  const entityData = useSelector((state: any) => getReportEntityData(state, entityId));
  const isLoading = useSelector((state: any) => getReportEntityLoading(state, entityId));
  const error = useSelector((state: any) => getReportEntityError(state, entityId));

  if (isLoading) {
    return (
      <Box
        style={{
          border: "2px solid #4285f4",
          borderRadius: "8px",
          backgroundColor: "#f8f9fa",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "300px",
          height: "460px", // 400px + 2rem padding
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
          minHeight: "300px",
          height: "460px", // 400px + 2rem padding
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text color="red">Error: {error}</Text>
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
          minHeight: "300px",
          height: "460px", // 400px + 2rem padding
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <Text
          size="sm"
          style={{ marginBottom: "0.5rem", fontWeight: "bold", textAlign: "center" }}
        >
          <a
            href={`/dashboard/${node.attrs.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', color: 'inherit' }}
            onMouseEnter={(e) => {(e.target as HTMLElement).style.textDecoration = 'underline'}}
            onMouseLeave={(e) => {(e.target as HTMLElement).style.textDecoration = 'none'}}
          >
            {node.attrs.name} (Dashboard)
          </a>
        </Text>
        <Text size="sm" style={{ textAlign: "center" }}>
          Dashboard visualizations not supported yet
        </Text>
      </Box>
    );
  }

  // If we have entity data from the report run, render the visualization
  if (entityData && Array.isArray(entityData) && entityData.length > 0) {
    console.log('Rendering visualization with entityData:', entityData);

    return (
            <Box
        style={{
          border: "2px solid #34a853",
          borderRadius: "8px",
          backgroundColor: "#ffffff",
          margin: "1rem 0",
          padding: "1rem",
          minHeight: "300px",
          height: "460px", // 400px + 2rem padding
          position: "relative",
        }}
      >
        <Group style={{ justifyContent: "space-between", marginBottom: "1rem", alignItems: "flex-start" }}>
          <Text
            size="sm"
            style={{ fontWeight: "bold", flex: 1 }}
          >
            <a
              href={node.attrs.model === 'card' ? `/question/${node.attrs.id}` :
                    node.attrs.model === 'table' ? `/browse/table/${node.attrs.id}` :
                    `/browse/${node.attrs.model}/${node.attrs.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: 'inherit' }}
              onMouseEnter={(e) => {(e.target as HTMLElement).style.textDecoration = 'underline'}}
              onMouseLeave={(e) => {(e.target as HTMLElement).style.textDecoration = 'none'}}
            >
              {node.attrs.name} ({node.attrs.model})
            </a>
          </Text>
          {node.attrs.model === 'card' && (
            <Button
              size="xs"
              variant="subtle"
              onClick={(e) => {
                e.stopPropagation();
                onOpenQueryBuilder?.(node.attrs);
              }}
            >
              <Icon name="pencil" size={12} style={{ marginRight: '4px' }} />
              Edit Query
            </Button>
          )}
        </Group>
        <Box style={{ height: "400px", width: "100%" }}>
          <EmotionCacheProvider>
            <Visualization
              rawSeries={entityData}
              isDashboard={false}
              width={600}
              height={400}
              showTitle={false}
              handleVisualizationClick={() => {}}
            />
          </EmotionCacheProvider>
        </Box>
      </Box>
    );
  }

  // Placeholder when no data is available (report hasn't been run)
  return (
    <Box
      style={{
        border: "2px solid #fbbc04",
        borderRadius: "8px",
        backgroundColor: "#fff8e1",
        margin: "1rem 0",
        padding: "1rem",
        minHeight: "300px",
        height: "460px", // 400px + 2rem padding
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
      }}
    >
      <Text
        size="sm"
        style={{ marginBottom: "0.5rem", fontWeight: "bold", textAlign: "center" }}
      >
        <a
          href={node.attrs.model === 'card' ? `/question/${node.attrs.id}` :
                node.attrs.model === 'table' ? `/browse/table/${node.attrs.id}` :
                `/browse/${node.attrs.model}/${node.attrs.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', color: 'inherit' }}
          onMouseEnter={(e) => {(e.target as HTMLElement).style.textDecoration = 'underline'}}
          onMouseLeave={(e) => {(e.target as HTMLElement).style.textDecoration = 'none'}}
        >
          {node.attrs.name} ({node.attrs.model})
        </a>
      </Text>
      <Text size="sm" style={{ textAlign: "center" }}>
        {error ? `Error: ${error}` : "Run the report to see this visualization"}
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
            root.render(React.createElement(VisualizationNodeWithProviders, {
              node,
              store,
              onOpenQueryBuilder: () => {
                // Access the handler from the global scope
                (window as any).reportEditorHandlers?.openQueryBuilder?.(node.attrs);
              }
            }));
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
            root.render(React.createElement(VisualizationNodeWithProviders, {
              node: updatedNode,
              store,
              onOpenQueryBuilder: () => {
                // Access the handler from the global scope or store
                (window as any).reportEditorHandlers?.openQueryBuilder?.(updatedNode.attrs);
              }
            }));
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
  const [reportTitle, setReportTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionCommand, setMentionCommand] = useState<((item: any) => void) | null>(null);
  const [mentionRect, setMentionRect] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [queryBuilderEntity, setQueryBuilderEntity] = useState<any>(null);
  const [isQueryBuilderOpen, setIsQueryBuilderOpen] = useState(false);

  // Redux state and dispatch
  const dispatch = useDispatch();
  const isReportRunning = useSelector((state: any) => getIsReportRunning(state));
  const canRunReport = useSelector((state: any) => getReportCanRun(state));
  const lastRunAt = useSelector((state: any) => getReportLastRunAt(state));
  const runError = useSelector((state: any) => getReportRunError(state));
  const resultsWithStatus = useSelector((state: any) => getReportResultsWithStatus(state));

  // Get the current theme and store to pass to node views
  const theme = useMantineTheme();
  // Access the global store from window.Metabase.store
  const store = (window as any).Metabase?.store;

  const { data: searchResults } = useSearchQuery(
    searchQuery.length >= 2 ? { q: searchQuery } : skipToken
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

  // Function to extract Metabase entities from the document
  const extractEntitiesFromDocument = useCallback(() => {
    if (!editor) return;

    const entities: any[] = [];
    const doc = editor.state.doc;

    doc.descendants((node: any) => {
      if (node.type.name === 'metabaseVisualization') {
        entities.push({
          id: node.attrs.id,
          name: node.attrs.name,
          type: node.attrs.type,
          model: node.attrs.model,
        });
      }
    });

    // Update Redux state with the entities
    dispatch(updateEntities(entities));
  }, [editor, dispatch]);

  // Update entities list when editor content changes
  useEffect(() => {
    if (editor) {
      // Extract entities on initial load
      extractEntitiesFromDocument();

      // Listen for content changes
      const updateHandler = () => {
        extractEntitiesFromDocument();
      };

      editor.on('update', updateHandler);

      return () => {
        editor.off('update', updateHandler);
      };
    }
  }, [editor, extractEntitiesFromDocument]);



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

  const handleEntityClick = useCallback((entity: any) => {
    // Get the fresh result from Redux state instead of using the passed result
    const currentResult = resultsWithStatus.find(r => r.entity.id === entity.id)?.result;
    setSelectedEntity(entity);
    setSelectedResult(currentResult);
    setIsModalOpen(true);
  }, [resultsWithStatus]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedEntity(null);
    setSelectedResult(null);
  }, []);

  const handleOpenQueryBuilder = useCallback((entityAttrs: any) => {
    setQueryBuilderEntity(entityAttrs);
    setIsQueryBuilderOpen(true);
  }, []);

  const handleCloseQueryBuilder = useCallback(() => {
    setIsQueryBuilderOpen(false);
    setQueryBuilderEntity(null);
  }, []);

  const handleQueryBuilderVisualize = useCallback(async (newQuestion: Question) => {
    // This will be called when user hits "Visualize" in the Query Builder
    // Save the new question and replace it in the document
    try {
      // Save the question via API
      const savedQuestion = await dispatch(Questions.actions.create(newQuestion.card()));

      // Find and replace the old visualization node in the editor
      if (editor && savedQuestion?.id) {
        const doc = editor.state.doc;
        let foundNodePos = null;
        let foundNode = null;

                // Find the node with matching ID
        doc.descendants((node: any, pos: number) => {
          if (node.type.name === 'metabaseVisualization' && queryBuilderEntity && node.attrs.id === queryBuilderEntity.id) {
            foundNodePos = pos;
            foundNode = node;
            return false; // Stop iteration
          }
        });

        if (foundNodePos !== null && foundNode) {
          // Replace the node with updated attributes
          const tr = editor.state.tr.setNodeMarkup(foundNodePos, null, {
            ...(foundNode as any).attrs,
            id: savedQuestion.id,
            name: newQuestion.displayName() || savedQuestion.name,
          });

          editor.view.dispatch(tr);

          // Update Redux state with the new entity
          const newEntity = {
            id: savedQuestion.id,
            name: newQuestion.displayName() || savedQuestion.name,
            type: savedQuestion.type || 'card',
            model: 'card' as const,
          };

          dispatch(updateEntities([newEntity]));
        }
      }

      handleCloseQueryBuilder();
    } catch (error) {
      console.error('Error saving question:', error);
    }
  }, [handleCloseQueryBuilder, editor, dispatch, queryBuilderEntity]);

  // Set up global handlers for the TipTap node views
  useEffect(() => {
    (window as any).reportEditorHandlers = {
      openQueryBuilder: handleOpenQueryBuilder,
    };

    return () => {
      delete (window as any).reportEditorHandlers;
    };
  }, [handleOpenQueryBuilder]);

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const containerRect = resizeRef.current?.parentElement?.getBoundingClientRect();
    if (containerRect) {
      const newSidebarWidth = containerRect.right - e.clientX;
      const minWidth = 200;
      const maxWidth = containerRect.width - 400; // Leave at least 400px for editor

      setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, newSidebarWidth)));
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Main content area with resizable layout */}
      <Flex style={{ flex: 1, overflow: 'hidden' }}>
        {/* Editor section */}
        <Box
          style={{
            flex: 1,
            overflow: 'auto',
            paddingRight: '8px'
          }}
        >
          <EditorContainer>
            <Paper m="lg" style={{ maxWidth: 'none', border: '1px solid #e0e0e0' }}>
              <Box p="md" px="xl" mt="lg">
                <TextInput
                  value={reportTitle}
                  onChange={(event) => setReportTitle(event.currentTarget.value)}
                  placeholder="New Report"
                  variant="unstyled"
                  size="xl"
                  styles={{
                    input: {
                      fontSize: '2rem',
                      fontWeight: 700,
                      lineHeight: 1.2,
                      padding: 0,
                      border: 'none',
                      borderRadius: 0,
                      '&:focus': {
                        outline: '2px solid #1976d2',
                        outlineOffset: '2px'
                      },
                      '&::placeholder': {
                        color: '#999',
                        opacity: 0.7
                      }
                    }
                  }}
                />
              </Box>
              <StyledEditorContent>
                <EditorContent editor={editor} />
              </StyledEditorContent>
            </Paper>
          </EditorContainer>
        </Box>

        {/* Resize handle */}
        <Box
          ref={resizeRef}
          onMouseDown={handleMouseDown}
          style={{
            width: '4px',
            backgroundColor: isResizing ? '#1976d2' : '#e0e0e0',
            cursor: 'col-resize',
            flexShrink: 0,
            transition: isResizing ? 'none' : 'background-color 0.2s',
            ':hover': {
              backgroundColor: '#1976d2'
            }
          }}
        />

        {/* Sidebar */}
        <Box
          style={{
            width: `${sidebarWidth}px`,
            overflow: 'auto',
            flexShrink: 0,
            paddingLeft: '8px'
          }}
        >
                              <Paper m="lg" style={{ height: 'fit-content', minHeight: '500px' }}>
            <Stack p="md" gap="md">
              <Text size="lg" fw={500}>Document Entities</Text>

              <Stack gap="xs">
                <Group style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <Text size="sm" fw={500}>
                    Metabase Items ({resultsWithStatus.length})
                  </Text>
                  <Button
                    size="xs"
                    onClick={() => dispatch(runReport())}
                    disabled={!canRunReport}
                    loading={isReportRunning}
                    style={{
                      backgroundColor: '#34a853',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    {isReportRunning ? 'Running...' : 'Run Report'}
                  </Button>
                </Group>

                {lastRunAt && (
                  <Text size="xs" color="dimmed" style={{ marginBottom: '8px' }}>
                    Last run: {new Date(lastRunAt).toLocaleString()}
                  </Text>
                )}

                {runError && (
                  <Text size="xs" color="red" style={{ marginBottom: '8px' }}>
                    Error: {runError}
                  </Text>
                )}

                {resultsWithStatus.length === 0 ? (
                  <Text size="xs" color="dimmed" style={{ fontStyle: 'italic' }}>
                    No Metabase entities in this document yet. Use @ to add charts, tables, or dashboards.
                  </Text>
                ) : (
                  <Stack gap="xs">
                    {resultsWithStatus.map(({ entity, result, hasData, isLoading, hasError }, index) => (
                                                                    <Box
                        key={`${entity.id}-${index}`}
                        onClick={() => handleEntityClick(entity)}
                        style={{
                          padding: '8px',
                          border: `1px solid ${hasError ? '#ea4335' : hasData ? '#34a853' : '#fbbc04'}`,
                          borderRadius: '4px',
                          backgroundColor: hasError ? '#fef7f0' : hasData ? '#f0f9f4' : '#fff8e1',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s, transform 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                          <Group style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box style={{ flex: 1 }}>
                              <Text size="sm" fw={500} style={{ marginBottom: '2px' }}>
                                {entity.name}
                              </Text>
                              <Group gap="xs">
                                <Text size="xs" color="dimmed">
                                  {entity.model === 'table' ? 'Table' :
                                   entity.model === 'card' ? 'Question' :
                                   entity.model === 'dashboard' ? 'Dashboard' :
                                   entity.model}
                                </Text>
                                <Text size="xs" color="dimmed">
                                  ID: {entity.id}
                                </Text>
                              </Group>
                              <Text size="xs" color={hasError ? 'red' : hasData ? 'green' : 'orange'} style={{ marginTop: '4px' }}>
                                {isLoading ? 'Loading...' :
                                 hasError ? 'Error' :
                                 hasData ? 'Ready' :
                                 'Pending'}
                              </Text>
                            </Box>
                            <Icon
                              name={entity.model === 'table' ? 'table' :
                                    entity.model === 'card' ? 'insight' :
                                    entity.model === 'dashboard' ? 'dashboard' :
                                    'info'}
                              size={16}
                              style={{ color: '#666', flexShrink: 0 }}
                            />
                          </Group>
                        </Box>
                    ))}
                  </Stack>
                )}
              </Stack>

              <Stack gap="xs">
                <Text size="sm" fw={500}>Quick Actions</Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant={editor?.isActive('bold') ? 'filled' : 'outline'}
                    onClick={handleBold}
                  >
                    <Icon name="bolt" size={12} style={{ marginRight: '4px' }} />
                    Bold
                  </Button>
                  <Button
                    size="xs"
                    variant={editor?.isActive('italic') ? 'filled' : 'outline'}
                    onClick={handleItalic}
                  >
                    <Icon name="pencil" size={12} style={{ marginRight: '4px' }} />
                    Italic
                  </Button>
                </Group>
                <Button
                  size="sm"
                  onClick={handleSave}
                  style={{ marginTop: '8px' }}
                >
                  <Icon name="sql" size={14} style={{ marginRight: '4px' }} />
                  Save Report
                </Button>
              </Stack>

              <Stack gap="xs">
                <Text size="sm" fw={500}>Help</Text>
                <Text size="xs" color="dimmed">
                  Use @ to mention charts, tables, or dashboards from your Metabase instance.
                </Text>
                <Text size="xs" color="dimmed">
                  Entities will appear in the list above as you add them to your report.
                </Text>
              </Stack>
            </Stack>
          </Paper>
        </Box>
      </Flex>

      {/* Mention suggestions overlay */}
      {showMentions && mentionRect && (
        <MentionSuggestions
          items={searchResults?.data || []}
          command={mentionCommand}
          clientRect={mentionRect}
        />
      )}

      {/* Entity result modal */}
      <EntityResultModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        entity={selectedEntity}
        result={selectedResult}
      />

            {/* Query Builder modal */}
      {queryBuilderEntity && (
        <QueryBuilderModal
          entity={queryBuilderEntity}
          isOpen={isQueryBuilderOpen}
          onClose={handleCloseQueryBuilder}
          onVisualize={handleQueryBuilderVisualize}
        />
      )}
    </Box>
  );
};

export default ReportEditor;
