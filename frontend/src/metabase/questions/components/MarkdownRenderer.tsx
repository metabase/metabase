import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";
import UserAvatar from "metabase/common/components/UserAvatar";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";

import { VisualizationEmbed } from "./VisualizationEmbed";

interface MarkdownRendererProps {
  content: string;
  onTextNodeClick?: (nodeId: string, text: string) => void;
  onSelectionChange?: (selectedNodes: string[]) => void;
  onStartNewQuestion?: (selectedText: string) => void;
  onRequestNodeReview?: (nodeId: string, text: string, reviewerId: string) => void;
  onAddToChat?: (nodeId: string, text: string) => void;
  nodeReviewers?: Record<string, Array<{ id: string; name: string; status: string }>>;
  availableReviewers?: Array<{ id: string; name: string; email: string; avatar?: string }>;
}

interface _TextNode {
  id: string;
  text: string;
  element: HTMLElement;
}

// Generate a unique ID for text nodes
const generateNodeId = (text: string, index: number): string => {
  const sanitized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
  return `text-node-${sanitized}-${index}`;
};

// Create a text node wrapper component with context menu
const TextNodeWrapper: React.FC<{
  nodeId: string;
  text: string;
  onTextNodeClick?: (nodeId: string, text: string) => void;
  isSelected: boolean;
  onSelectionChange: (nodeId: string, isSelected: boolean, isMultiSelect: boolean) => void;
  onStartNewQuestion?: (selectedText: string) => void;
  onRequestNodeReview?: (nodeId: string, text: string, reviewerId: string) => void;
  onAddToChat?: (nodeId: string, text: string) => void;
  nodeReviewers?: Record<string, Array<{ id: string; name: string; status: string }>>;
  availableReviewers?: Array<{ id: string; name: string; email: string; avatar?: string }>;
  children: React.ReactNode;
}> = ({ nodeId, text, onTextNodeClick, isSelected, onSelectionChange, onStartNewQuestion, onRequestNodeReview, onAddToChat, nodeReviewers, availableReviewers, children }) => {
  const [menuOpened, setMenuOpened] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey;
    onSelectionChange(nodeId, !isSelected, isMultiSelect);

    if (!isMultiSelect) {
      onTextNodeClick?.(nodeId, text);
    }
  }, [nodeId, text, onTextNodeClick, isSelected, onSelectionChange]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSelected) {
      setMenuOpened(true);
    }
  }, [isSelected]);

  // Sample reviewers - in a real app this would come from props or API
  const reviewers = [
    { id: "user1", name: "John Smith", role: "Data Analyst" },
    { id: "user2", name: "Sarah Johnson", role: "Business Intelligence" },
    { id: "user3", name: "Mike Chen", role: "Product Manager" },
    { id: "user4", name: "Lisa Wong", role: "Data Scientist" },
  ];

  return (
    <Menu opened={menuOpened} onClose={() => setMenuOpened(false)} position="bottom-start" shadow="md">
      <Menu.Target>
        <span
          id={nodeId}
          data-node-id={nodeId}
          data-text-content={text}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          style={{
            cursor: "pointer",
            transition: "background-color 0.2s ease",
            backgroundColor: isSelected
              ? "var(--mb-color-brand)"
              : "transparent",
            color: isSelected
              ? "white"
              : "inherit",
            padding: isSelected ? "2px 4px" : "2px 4px",
            borderRadius: "3px",
            margin: "0 1px",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = "var(--mb-color-bg-light)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          {children}

          {/* Yellow review indicator */}
          {nodeReviewers?.[nodeId] && nodeReviewers[nodeId].length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "var(--mb-color-warning)",
                border: "1px solid white",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.1)",
                zIndex: 1,
              }}
            />
          )}
        </span>
      </Menu.Target>

      {/* Review status indicator */}
      {nodeReviewers?.[nodeId] && nodeReviewers[nodeId].length > 0 && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--mb-color-text-medium)",
            marginTop: "2px",
            marginLeft: "4px",
            fontStyle: "italic",
          }}
        >
          Review requested: {nodeReviewers[nodeId].map(r => r.name).join(", ")}
        </div>
      )}
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name="insight" />}
          onClick={() => {
            onStartNewQuestion?.(text);
            setMenuOpened(false);
          }}
        >
          {t`Start new question from here`}
        </Menu.Item>
        <Menu.Item
          onClick={() => {
            onAddToChat?.(nodeId, text);
            setMenuOpened(false);
          }}
        >
          {t`Add to chat`}
        </Menu.Item>
        <Menu trigger="click-hover" position="right" width={200}>
          <Menu.Target>
            <Menu.Item
              leftSection={<Icon name="eye" />}
              rightSection={<Icon name="chevronright" aria-hidden />}
            >
              {t`Request review`}
            </Menu.Item>
          </Menu.Target>
          <Menu.Dropdown>
            {availableReviewers?.map(reviewer => (
              <Menu.Item
                key={reviewer.id}
                onClick={() => {
                  onRequestNodeReview?.(nodeId, text, reviewer.id);
                  setMenuOpened(false);
                }}
                leftSection={
                  <UserAvatar
                    user={{
                      first_name: reviewer.name.split(' ')[0],
                      last_name: reviewer.name.split(' ').slice(1).join(' '),
                      common_name: reviewer.name,
                      email: reviewer.email,
                    }}
                  />
                }
              >
                {reviewer.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Menu.Dropdown>
    </Menu>
  );
};



// Custom components for react-markdown
const createCustomComponents = (
  selectedNodes: Set<string>,
  onSelectionChange: (nodeId: string, isSelected: boolean, isMultiSelect: boolean) => void,
  onStartNewQuestion?: (selectedText: string) => void,
  onTextNodeClick?: (nodeId: string, text: string) => void,
  onRequestNodeReview?: (nodeId: string, text: string, reviewerId: string) => void,
  onAddToChat?: (nodeId: string, text: string) => void,
  nodeReviewers?: Record<string, Array<{ id: string; name: string; status: string }>>,
  availableReviewers?: Array<{ id: string; name: string; email: string; avatar?: string }>,
) => ({
  // Custom paragraph component that adds IDs to text nodes and handles viz embeds
  p: ({ children, ...props }: any) => {
    const textContent = React.Children.toArray(children).join("");

    // Check if this paragraph contains a visualization embed
    const vizMatch = textContent.match(/\{\{viz:(\d+)(?::([^}]+))?\}\}/);
    if (vizMatch) {
      const questionId = parseInt(vizMatch[1], 10);
      const fullDescription = vizMatch[2] || "";

      // Split the description into title and description if it contains a colon
      let title: string | undefined;
      let description: string | undefined;

      if (fullDescription) {
        const colonIndex = fullDescription.indexOf(":");
        if (colonIndex !== -1) {
          title = fullDescription.substring(0, colonIndex).trim();
          description = fullDescription.substring(colonIndex + 1).trim();
        } else {
          title = fullDescription.trim();
        }
      }

      return (
        <VisualizationEmbed
          questionId={questionId}
          title={title}
          description={description}
        />
      );
    }

        // Check if this paragraph contains a table embed
    const tableMatch = textContent.match(/\{\{table:([^:]+)(?::([^}]+))?\}\}/);
    if (tableMatch) {
      const tableTitle = tableMatch[1].trim();
      const tableDescription = tableMatch[2] || "";

      // Create sample table data in the format expected by Metabase's Table visualization
      const tableSeries: RawSeries = [{
        card: {
          id: 8,
          name: tableTitle,
          display: "table" as const,
          visualization_settings: {},
          dataset_query: {
            type: "native" as const,
            native: { query: "" },
            database: 1,
          },
        },
        data: {
          cols: [
            { name: "Category", display_name: "Category", base_type: "type/Text", semantic_type: "type/Category" },
            { name: "Revenue", display_name: "Revenue", base_type: "type/Text", semantic_type: "type/Category" },
            { name: "Growth", display_name: "Growth", base_type: "type/Text", semantic_type: "type/Category" },
            { name: "Market Share", display_name: "Market Share", base_type: "type/Text", semantic_type: "type/Category" },
          ],
          rows: [
            ["Cloud Storage", "$450K", "+15%", "32%"],
            ["Data Analytics", "$380K", "+22%", "27%"],
            ["Security Suite", "$320K", "+8%", "23%"],
            ["AI/ML Tools", "$280K", "+35%", "18%"],
          ],
          rows_truncated: 0,
        },
        started_at: new Date().toISOString(),
      }];

      return (
        <div style={{ marginBottom: "1.5rem" }}>
          {tableTitle && (
            <h4 style={{ marginBottom: "0.75rem", fontSize: "1.1rem", fontWeight: "600" }}>
              {tableTitle}
            </h4>
          )}
          {tableDescription && (
            <p style={{ marginBottom: "1rem", color: "var(--mb-color-text-medium)", fontSize: "0.875rem" }}>
              {tableDescription}
            </p>
          )}
          <div style={{ height: "300px", width: "100%" }}>
            <Visualization
              rawSeries={tableSeries}
              showTitle={false}
              isDashboard={false}
              isQueryBuilder={false}
              isEditing={false}
              isMobile={false}
              isNightMode={false}
              isSettings={false}
              isEmbeddingSdk={false}
              isFullscreen={false}
              isVisualizerViz={false}
              showAllLegendItems={false}
              isRawTable={false}
              scrollToLastColumn={false}
              width={400}
              height={280}
              onRender={() => {}}
              onRenderError={() => {}}
              onActionDismissal={() => {}}
              onHoverChange={() => {}}
              onVisualizationClick={() => {}}
              onUpdateVisualizationSettings={() => {}}
              visualizationIsClickable={() => false}
              dispatch={() => {}}
              fontFamily="Lato, sans-serif"
              hasDevWatermark={false}
            />
          </div>
        </div>
      );
    }

    // Regular paragraph processing
    const textNodes = React.Children.toArray(children).filter(
      (child) =>
        typeof child === "string" ||
        (React.isValidElement(child) && child.type === "text"),
    );

    const processedChildren = textNodes.map((child, index) => {
      if (typeof child === "string") {
                const nodeId = generateNodeId(child, index);
        const isSelected = selectedNodes.has(nodeId);

        return (
          <TextNodeWrapper
            key={nodeId}
            nodeId={nodeId}
            text={child}
            onTextNodeClick={onTextNodeClick}
            isSelected={isSelected}
            onSelectionChange={onSelectionChange}
            onStartNewQuestion={onStartNewQuestion}
            onRequestNodeReview={onRequestNodeReview}
            onAddToChat={onAddToChat}
            nodeReviewers={nodeReviewers}
            availableReviewers={availableReviewers}
          >
            {child}
          </TextNodeWrapper>
        );
      }
      return child;
    });

    return <p {...props}>{processedChildren}</p>;
  },

  // Custom heading components
  h1: ({ children, ...props }: any) => (
    <h1
      {...props}
      style={{
        fontSize: "1.75rem",
        fontWeight: "600",
        marginTop: "1.5rem",
        marginBottom: "1rem",
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: any) => (
    <h2
      {...props}
      style={{
        fontSize: "1.5rem",
        fontWeight: "600",
        marginTop: "1.25rem",
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: any) => (
    <h3
      {...props}
      style={{
        fontSize: "1.25rem",
        fontWeight: "600",
        marginTop: "1rem",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children, ...props }: any) => (
    <h4
      {...props}
      style={{
        fontSize: "1.1rem",
        fontWeight: "600",
        marginTop: "0.75rem",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </h4>
  ),

  // Custom list components
  ul: ({ children, ...props }: any) => (
    <ul {...props} style={{ marginLeft: "1.5rem", marginBottom: "1rem" }}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: any) => (
    <ol {...props} style={{ marginLeft: "1.5rem", marginBottom: "1rem" }}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: any) => {
    // Process text nodes within list items for clickable functionality
    const textNodes = React.Children.toArray(children).filter(
      (child) =>
        typeof child === "string" ||
        (React.isValidElement(child) && child.type === "text"),
    );

    const processedChildren = textNodes.map((child, index) => {
      if (typeof child === "string") {
        const nodeId = generateNodeId(child, index);
        const isSelected = selectedNodes.has(nodeId);

        return (
          <TextNodeWrapper
            key={nodeId}
            nodeId={nodeId}
            text={child}
            onTextNodeClick={onTextNodeClick}
            isSelected={isSelected}
            onSelectionChange={onSelectionChange}
            onStartNewQuestion={onStartNewQuestion}
            onRequestNodeReview={onRequestNodeReview}
            onAddToChat={onAddToChat}
            nodeReviewers={nodeReviewers}
            availableReviewers={availableReviewers}
          >
            {child}
          </TextNodeWrapper>
        );
      }
      return child;
    });

    return (
      <li {...props} style={{ marginBottom: "0.25rem" }}>
        {processedChildren}
      </li>
    );
  },

  // Custom blockquote component
  blockquote: ({ children, ...props }: any) => (
    <blockquote
      {...props}
      style={{
        borderLeft: "4px solid var(--mb-color-brand)",
        paddingLeft: "1rem",
        marginLeft: "0",
        marginRight: "0",
        fontStyle: "italic",
        color: "var(--mb-color-text-medium)",
      }}
    >
      {children}
    </blockquote>
  ),

  // Custom code components
  code: ({ children, className, ...props }: any) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          {...props}
          style={{
            backgroundColor: "var(--mb-color-bg-light)",
            padding: "0.125rem 0.25rem",
            borderRadius: "0.25rem",
            fontSize: "0.875em",
            fontFamily: "monospace",
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <pre
        style={{
          backgroundColor: "var(--mb-color-bg-light)",
          padding: "1rem",
          borderRadius: "0.375rem",
          overflow: "auto",
          marginBottom: "1rem",
        }}
      >
        <code {...props} style={{ fontFamily: "monospace" }}>
          {children}
        </code>
      </pre>
    );
  },

  // Custom table components
  table: ({ children, ...props }: any) => (
    <table
      {...props}
      style={{
        width: "100%",
        borderCollapse: "collapse",
        marginBottom: "1rem",
      }}
    >
      {children}
    </table>
  ),
  thead: ({ children, ...props }: any) => (
    <thead {...props} style={{ backgroundColor: "var(--mb-color-bg-light)" }}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }: any) => (
    <tr {...props} style={{ borderBottom: "1px solid var(--mb-color-border)" }}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }: any) => (
    <th
      {...props}
      style={{
        padding: "0.75rem",
        textAlign: "left",
        fontWeight: "600",
        borderBottom: "2px solid var(--mb-color-border)",
      }}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: any) => (
    <td {...props} style={{ padding: "0.75rem" }}>
      {children}
    </td>
  ),

  // Custom link component
  a: ({ children, href, ...props }: any) => (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--mb-color-brand)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.textDecoration = "underline";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.textDecoration = "none";
      }}
    >
      {children}
    </a>
  ),

  // Custom strong component
  strong: ({ children, ...props }: any) => (
    <strong {...props} style={{ fontWeight: "600" }}>
      {children}
    </strong>
  ),

  // Custom emphasis component
  em: ({ children, ...props }: any) => (
    <em {...props} style={{ fontStyle: "italic" }}>
      {children}
    </em>
  ),
});

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onTextNodeClick,
  onSelectionChange,
  onStartNewQuestion,
  onRequestNodeReview,
  onAddToChat,
  nodeReviewers,
  availableReviewers,
}) => {
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Update URL when selection changes
  useEffect(() => {
    if (selectedNodes.size > 0) {
      const selectedIds = Array.from(selectedNodes);
      const url = new URL(window.location.href);
      url.searchParams.set("selected", selectedIds.join(","));
      window.history.replaceState({}, "", url.toString());
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("selected");
      window.history.replaceState({}, "", url.toString());
    }

    onSelectionChange?.(Array.from(selectedNodes));
  }, [selectedNodes, onSelectionChange]);

  // Load selection from URL on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const selectedParam = url.searchParams.get("selected");
    if (selectedParam) {
      const selectedIds = selectedParam.split(",");
      setSelectedNodes(new Set(selectedIds));
    }
  }, []);

  const handleSelectionChange = useCallback((nodeId: string, isSelected: boolean, _isMultiSelect: boolean) => {
    setSelectedNodes(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
      return newSet;
    });
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedNodes.size > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }, [selectedNodes]);

  const handleStartNewQuestion = useCallback(() => {
    const _selectedTexts = Array.from(selectedNodes).map(nodeId => {
      const element = document.getElementById(nodeId);
      return element?.getAttribute("data-text-content") || "";
    }).join(" ");

    // TODO: Implement navigation to questions page with selected text
    // console.log("Starting new question with:", selectedTexts);
  }, [selectedNodes]);

  const handleAskForReview = useCallback((_reviewerId: string) => {
    const _selectedTexts = Array.from(selectedNodes).map(nodeId => {
      const element = document.getElementById(nodeId);
      return element?.getAttribute("data-text-content") || "";
    }).join(" ");

    // TODO: Implement review request functionality
    // console.log("Asking for review from", reviewerId, "with:", selectedTexts);
  }, [selectedNodes]);

  const customComponents = useMemo(
    () => createCustomComponents(selectedNodes, handleSelectionChange, onStartNewQuestion, onTextNodeClick, onRequestNodeReview, onAddToChat, nodeReviewers, availableReviewers),
    [selectedNodes, handleSelectionChange, onStartNewQuestion, onTextNodeClick, onRequestNodeReview, onAddToChat, nodeReviewers, availableReviewers],
  );

  return (
    <div
      style={{ lineHeight: "1.6", fontSize: "0.95rem" }}
      onContextMenu={handleContextMenu}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>
        {content}
      </ReactMarkdown>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onStartNewQuestion={handleStartNewQuestion}
          onAskForReview={handleAskForReview}
        />
      )}
    </div>
  );
};
