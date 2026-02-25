import { useEffect, useMemo, useState } from "react";
import { ReadOnlyNotebook } from "../../../vendor/notebook-component.esm.js";
import type {
  PreviewData,
  TransformPreviewData,
  CardPreviewData,
  ExtensionToPreviewMessage,
  NativeTransformQuery,
  NotebookData,
} from "../../../src/shared-types";
import {
  CodeIcon,
  DatabaseIcon,
  FileTextIcon,
  LinkIcon,
  ArrowRightIcon,
  PlayIcon,
} from "./icons";
import { vscode } from "../vscode";
import { buildMetadata, buildQuestion } from "../notebook/question-proxy";

export function TransformPreview() {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent<ExtensionToPreviewMessage>) {
      const message = event.data;
      if (message.type === "previewInit" || message.type === "previewUpdate") {
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

  if (data.kind === "card") {
    return <CardPreview data={data.data} />;
  }

  return <TransformPreviewView data={data.data} />;
}

function CardPreview({ data }: { data: CardPreviewData }) {
  return (
    <div className="preview-root">
      <header className="preview-header">
        <div className="preview-title-row">
          <h1 className="preview-title">{data.name}</h1>
          {data.cardType && (
            <span className="preview-badge" style={{ textTransform: "capitalize" }}>
              {data.cardType}
            </span>
          )}
          {data.database && (
            <span className="preview-badge">
              <DatabaseIcon size={12} />
              {data.database}
            </span>
          )}
        </div>
        {data.description && (
          <p className="preview-description">{data.description}</p>
        )}
      </header>
      <nav className="preview-toolbar">
        <button
          className="preview-toolbar-btn"
          onClick={() => vscode.postMessage({ type: "openFile", filePath: data.filePath })}
        >
          <FileTextIcon />
          View YAML
        </button>
        <button
          className="preview-toolbar-btn"
          onClick={() => vscode.postMessage({ type: "openGraph", entityId: data.entityId })}
        >
          <LinkIcon />
          Dependency Graph
        </button>
      </nav>
      <NotebookSection notebookData={data.notebookData} />
    </div>
  );
}

function TransformPreviewView({ data }: { data: TransformPreviewData }) {
  const database = data.query?.database ?? "";
  const canRun = data.sourceQueryType !== "query";
  const canEdit = data.sourceQueryType === "native" || data.sourceQueryType === "python";

  return (
    <div className="preview-root">
      <header className="preview-header">
        <div className="preview-title-row">
          <h1 className="preview-title">{data.name}</h1>
          {database && (
            <span className="preview-badge">
              <DatabaseIcon size={12} />
              {database}
            </span>
          )}
        </div>
        {data.description && (
          <p className="preview-description">{data.description}</p>
        )}
      </header>
      <nav className="preview-toolbar">
        {canRun ? (
          <button
            className="preview-toolbar-btn preview-toolbar-btn--run"
            onClick={() => vscode.postMessage({ type: "runTransform" })}
          >
            <PlayIcon />
            Run
          </button>
        ) : (
          <button
            className="preview-toolbar-btn preview-toolbar-btn--disabled"
            disabled
            title="Transforms based on the query builder cannot be run in a workspace"
          >
            <PlayIcon />
            Run
          </button>
        )}
        {canEdit && (
          <button
            className="preview-toolbar-btn"
            onClick={() =>
              vscode.postMessage({
                type: "editInEditor",
                filePath: data.filePath,
                lang: data.sourceQueryType === "python" ? "python" : "sql",
                name: data.name,
              })
            }
          >
            <CodeIcon />
            Edit in Editor
          </button>
        )}
        <button
          className="preview-toolbar-btn"
          onClick={() => vscode.postMessage({ type: "openFile", filePath: data.filePath })}
        >
          <FileTextIcon />
          View YAML
        </button>
        <button
          className="preview-toolbar-btn"
          onClick={() => vscode.postMessage({ type: "openGraph", entityId: data.entityId })}
        >
          <LinkIcon />
          Dependency Graph
        </button>
      </nav>

      {data.query?.type === "native" ? (
        <NativeQueryBlock query={data.query} />
      ) : data.notebookData ? (
        <NotebookSection notebookData={data.notebookData} />
      ) : (
        <p className="preview-empty-state">Unable to parse query</p>
      )}

      <PreviewFooter target={data.target} />
    </div>
  );
}

function NotebookSection({ notebookData }: { notebookData: NotebookData }) {
  const question = useMemo(() => {
    if (!notebookData.datasetQuery || !notebookData.metadata) {
      return null;
    }
    const metadata = buildMetadata(notebookData.metadata);
    return buildQuestion(notebookData.datasetQuery, metadata, notebookData.cardType);
  }, [notebookData.datasetQuery, notebookData.metadata, notebookData.cardType]);

  if (!question) {
    if (notebookData.queryType === "native" && notebookData.nativeSql) {
      return <SqlBlock sql={notebookData.nativeSql} />;
    }
    return <p className="preview-empty-state">Unable to parse query</p>;
  }

  return <ReadOnlyNotebook question={question as any} />;
}

function NativeQueryBlock({ query }: { query: NativeTransformQuery }) {
  return (
    <div className="preview-steps">
      <div>
        <div className="preview-step-label preview-step-label--brand">
          <CodeIcon size={14} />
          Native Query
        </div>
        <div className="preview-step-cell preview-step-cell--code">
          <SqlBlock sql={query.sql} />
        </div>
      </div>
    </div>
  );
}

function SqlBlock({ sql }: { sql: string }) {
  return (
    <pre className="preview-sql">
      <code>{sql}</code>
    </pre>
  );
}

function PreviewFooter({ target }: { target: TransformPreviewData["target"] }) {
  if (!target) {
    return null;
  }

  const ref = [target.database, target.schema, target.name];
  const tableName = target.schema
    ? `${target.schema}.${target.name}`
    : target.name;

  return (
    <footer className="preview-footer">
      <span className="preview-target-label">
        <ArrowRightIcon size={14} />
        Target table
      </span>
      <span className="preview-pill preview-pill--brand"
        style={{ cursor: "pointer" }}
        onClick={() => vscode.postMessage({ type: "openTable", ref })}
      >
        {tableName}
      </span>
      <span className="preview-badge">
        <DatabaseIcon size={12} />
        {target.database}
      </span>
    </footer>
  );
}
