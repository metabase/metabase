/**
 * Example: Conditional Library Loading
 * 
 * This example shows how to load libraries only when specific
 * functionality is actually used by the user.
 * 
 * Common use cases:
 * - PDF export (jspdf)
 * - Excel export (xlsx)
 * - Code formatting (prettier, sql-formatter)
 * - Image manipulation (html2canvas)
 */

/**
 * Example 1: PDF Export
 */

interface ExportToPdfOptions {
  filename?: string;
  element: HTMLElement;
}

export async function exportToPdf({ filename = "export.pdf", element }: ExportToPdfOptions) {
  // Load libraries only when export button is clicked
  const [jsPDF, html2canvas] = await Promise.all([
    import("jspdf").then(m => m.default),
    import("html2canvas-pro").then(m => m.default),
  ]);

  // Generate canvas from HTML
  const canvas = await html2canvas(element);
  
  // Create PDF
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(filename);
}

/**
 * Usage in component:
 * 
 * function Dashboard() {
 *   const handleExport = () => {
 *     const element = document.getElementById("dashboard");
 *     if (element) {
 *       exportToPdf({ element, filename: "dashboard.pdf" });
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleExport}>Export to PDF</button>
 *       <div id="dashboard">...</div>
 *     </div>
 *   );
 * }
 */

/**
 * Example 2: SQL Formatting
 */

export async function formatSql(sql: string): Promise<string> {
  // Load sql-formatter only when format button is clicked
  const { format } = await import("sql-formatter");
  
  return format(sql, {
    language: "postgresql",
    keywordCase: "upper",
  });
}

/**
 * Usage:
 * 
 * function SqlEditor() {
 *   const [sql, setSql] = useState("");
 *   const [isFormatting, setIsFormatting] = useState(false);
 * 
 *   const handleFormat = async () => {
 *     setIsFormatting(true);
 *     const formatted = await formatSql(sql);
 *     setSql(formatted);
 *     setIsFormatting(false);
 *   };
 * 
 *   return (
 *     <div>
 *       <textarea value={sql} onChange={e => setSql(e.target.value)} />
 *       <button onClick={handleFormat} disabled={isFormatting}>
 *         {isFormatting ? "Formatting..." : "Format SQL"}
 *       </button>
 *     </div>
 *   );
 * }
 */

/**
 * Example 3: Code Editor with Syntax Highlighting
 */

import { useState, useEffect } from "react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}

export function CodeEditor({ value, onChange, language = "sql" }: CodeEditorProps) {
  const [Editor, setEditor] = useState<any>(null);

  useEffect(() => {
    // Load CodeMirror when component mounts
    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/lang-sql"),
    ]).then(([codemirrorModule, sqlLang]) => {
      setEditor(() => codemirrorModule.default);
    });
  }, []);

  if (!Editor) {
    // Simple fallback while loading
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: "100%", minHeight: "200px" }}
      />
    );
  }

  return <Editor value={value} onChange={onChange} />;
}

/**
 * Example 4: Feature Flag Based Loading
 */

export async function loadVisualizationEngine(type: "echarts" | "d3" | "visx") {
  // Load only the visualization library needed
  switch (type) {
    case "echarts":
      return import("echarts");
    case "d3":
      return import("d3");
    case "visx":
      return Promise.all([
        import("@visx/axis"),
        import("@visx/scale"),
        import("@visx/shape"),
      ]);
    default:
      throw new Error(`Unknown visualization type: ${type}`);
  }
}

/**
 * Example 5: Progressive Enhancement
 * 
 * Load advanced features only after the main app is loaded
 */

export function initializeAdvancedFeatures() {
  // Use requestIdleCallback to load non-critical features
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => {
      // Load features during idle time
      import("./analytics-tracker").then(({ initAnalytics }) => {
        initAnalytics();
      });
      
      import("./error-reporting").then(({ initErrorReporting }) => {
        initErrorReporting();
      });
    });
  }
}

/**
 * Benefits of conditional loading:
 * 
 * 1. Reduces initial bundle size significantly
 * 2. Faster initial page load
 * 3. Better for users who don't use all features
 * 4. Libraries are cached after first use
 * 5. Can be combined with route-based splitting
 * 
 * Tradeoffs:
 * 
 * 1. Slight delay when feature is first used
 * 2. Need to handle loading states
 * 3. More complex code structure
 * 
 * Best for:
 * 
 * - Export features (PDF, Excel)
 * - Advanced editors
 * - Visualization libraries
 * - Analytics and tracking
 * - Admin-only features
 */
