import React, { useMemo } from "react";
import Markdown from "metabase/core/components/Markdown";
import ObjectDetail from "./ObjectDetail";

export default function MarkdownDetail({ series, settings, ...props }) {
  const [{ data }] = series;
  const template = settings["markdown.template"];

  const renderedMarkdown = useMemo(() => {
    if (!template) {
      return null;
    }

    try {
      const { cols, rows } = data;
      
      // Create template data with basic info
      const templateData = {
        title: "Data Table",
        row_count: rows.length,
        col_count: cols.length,
      };

      // Add column values from first row if available
      if (rows.length > 0) {
        cols.forEach((col, index) => {
          const value = rows[0][index];
          // Add both original name (lowercase) and version with spaces replaced by underscores
          const originalName = col.name.toLowerCase();
          const spacelessName = col.name.toLowerCase().replace(/\s+/g, '_');
          
          templateData[originalName] = value;
          templateData[spacelessName] = value;
        });
      }

      // Simple template variable processing
      const processed = template.replace(
        /{{([^}]+)}}/g,
        (_whole, variableName) => {
          const name = variableName.toLowerCase().trim();
          const value = templateData[name];
          return value !== undefined ? String(value) : "";
        }
      );

      return processed;
    } catch (error) {
      return `**Template Error:** ${error.message}`;
    }
  }, [data, template, settings]);

  if (template && renderedMarkdown) {
    return (
      <div style={{ padding: "1rem", height: "100%", overflow: "auto" }}>
        <Markdown>{renderedMarkdown}</Markdown>
      </div>
    );
  }

  // Show empty state with instructions if no template
  if (!template || template.trim() === "") {
    return (
      <div style={{ 
        padding: "2rem", 
        height: "100%", 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "center", 
        alignItems: "center",
        textAlign: "center",
        color: "#666"
      }}>
        <div style={{ maxWidth: "400px" }}>
          <h3 style={{ marginBottom: "1rem", color: "#333" }}>Create a Markdown Template</h3>
          <p style={{ marginBottom: "1.5rem", lineHeight: "1.5" }}>
            Use the <strong>Markdown Template</strong> field in the Display settings to create a custom view of your data.
          </p>
          <div style={{ 
            backgroundColor: "#f8f9fa", 
            padding: "1rem", 
            borderRadius: "4px", 
            marginBottom: "1.5rem",
            fontFamily: "monospace",
            fontSize: "13px",
            textAlign: "left"
          }}>
            <div style={{ marginBottom: "0.5rem", fontWeight: "bold" }}>Example template:</div>
            <div>
              # My Data Report<br/>
              <br/>
              **Total Records:** {`{{row_count}}`}<br/>
              **Columns:** {`{{col_count}}`}<br/>
              <br/>
              Use column references from the settings below.
            </div>
          </div>
          <p style={{ fontSize: "14px", color: "#888" }}>
            Check the column settings below to see the available variable names for your data.
          </p>
        </div>
      </div>
    );
  }

  // Fall back to regular ObjectDetail if template exists but didn't render
  return <ObjectDetail series={series} settings={settings} {...props} />;
}