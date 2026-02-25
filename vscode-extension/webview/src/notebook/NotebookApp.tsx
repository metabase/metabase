import { useEffect, useState } from "react";
import type { ExtensionToNotebookMessage, NotebookData } from "../../../src/shared-types";
import { ReadOnlyNotebook } from "./ReadOnlyNotebook";
import { vscode } from "../vscode";

export function NotebookApp() {
  const [data, setData] = useState<NotebookData | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<ExtensionToNotebookMessage>) {
      const message = event.data;
      if (
        message.type === "notebookInit" ||
        message.type === "notebookUpdate"
      ) {
        setData(message.data);
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!data) {
    return null;
  }

  return (
    <div className="notebook-root">
      <NotebookHeader data={data} />
      <NotebookToolbar data={data} />
      <ReadOnlyNotebook data={data} />
      <NotebookFooter data={data} />
    </div>
  );
}

function NotebookHeader({ data }: { data: NotebookData }) {
  return (
    <header className="notebook-header">
      <div className="notebook-title-row">
        <h1 className="notebook-title">{data.name}</h1>
        {data.database && (
          <span className="notebook-badge">
            <DatabaseIcon />
            {data.database}
          </span>
        )}
        {data.cardType && (
          <span className="notebook-badge notebook-badge--type">
            {data.cardType}
          </span>
        )}
      </div>
      {data.description && (
        <p className="notebook-description">{data.description}</p>
      )}
    </header>
  );
}

function NotebookToolbar({ data }: { data: NotebookData }) {
  return (
    <nav className="notebook-toolbar">
      <button
        className="notebook-toolbar-btn"
        onClick={() =>
          vscode.postMessage({ type: "openFile", filePath: data.filePath })
        }
      >
        <FileIcon />
        View YAML
      </button>
      <button
        className="notebook-toolbar-btn"
        onClick={() =>
          vscode.postMessage({ type: "openGraph", entityId: data.entityId })
        }
      >
        <GraphIcon />
        Dependency Graph
      </button>
    </nav>
  );
}

function NotebookFooter({ data }: { data: NotebookData }) {
  if (!data.target) {
    return null;
  }

  const tableName = data.target.schema
    ? `${data.target.schema}.${data.target.name}`
    : data.target.name;

  return (
    <footer className="notebook-footer">
      <span className="notebook-target-label">
        <ArrowRightIcon />
        Target table
      </span>
      <span className="notebook-pill notebook-pill--brand">{tableName}</span>
      <span className="notebook-badge">
        <DatabaseIcon />
        {data.target.database}
      </span>
    </footer>
  );
}

function DatabaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="8" cy="4" rx="6" ry="2.5" />
      <path d="M2 4v4c0 1.38 2.69 2.5 6 2.5S14 9.38 14 8V4" />
      <path d="M2 8v4c0 1.38 2.69 2.5 6 2.5S14 13.38 14 12V8" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1Z" />
      <path d="M9 1v4h4" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="8" cy="12" r="2" />
      <path d="M5.5 5.5L7 10.5M10.5 5.5L9 10.5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
