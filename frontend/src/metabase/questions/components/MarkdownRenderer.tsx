import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  onTextNodeClick?: (nodeId: string, text: string) => void;
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

// Custom components for react-markdown
const createCustomComponents = (
  onTextNodeClick?: (nodeId: string, text: string) => void,
) => ({
  // Custom paragraph component that adds IDs to text nodes
  p: ({ children, ...props }: any) => {
    const textNodes = React.Children.toArray(children).filter(
      (child) =>
        typeof child === "string" ||
        (React.isValidElement(child) && child.type === "text"),
    );

    const processedChildren = textNodes.map((child, index) => {
      if (typeof child === "string") {
        const nodeId = generateNodeId(child, index);
        return (
          <span
            key={nodeId}
            id={nodeId}
            data-node-id={nodeId}
            data-text-content={child}
            onClick={() => onTextNodeClick?.(nodeId, child)}
            style={{
              cursor: onTextNodeClick ? "pointer" : "default",
              transition: "background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (onTextNodeClick) {
                e.currentTarget.style.backgroundColor =
                  "var(--mb-color-bg-light)";
              }
            }}
            onMouseLeave={(e) => {
              if (onTextNodeClick) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {child}
          </span>
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
  li: ({ children, ...props }: any) => (
    <li {...props} style={{ marginBottom: "0.25rem" }}>
      {children}
    </li>
  ),

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

  // TODO: Add custom components for rich embeds and interactive charts
  // These will be used to embed Metabase visualizations and interactive elements
  // Example:
  // embed: ({ children, ...props }: any) => <EmbeddedChart {...props}>{children}</EmbeddedChart>,
  // chart: ({ children, ...props }: any) => <InteractiveChart {...props}>{children}</InteractiveChart>,
});

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onTextNodeClick,
}) => {
  const customComponents = useMemo(
    () => createCustomComponents(onTextNodeClick),
    [onTextNodeClick],
  );

  return (
    <div style={{ lineHeight: "1.6", fontSize: "0.95rem" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={customComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
};
