import { useEffect, useState } from "react";
import type {
  ExtensionToTableDataMessage,
  TableSchemaData,
  TableViewData,
} from "../../../src/shared-types";
import { vscode } from "../vscode";

type ViewState =
  | { status: "idle" }
  | { status: "loading"; tableName: string }
  | { status: "schema"; data: TableSchemaData }
  | { status: "loadingData"; data: TableSchemaData }
  | { status: "ready"; data: TableViewData }
  | { status: "error"; message: string };

export function TableDataView() {
  const [state, setState] = useState<ViewState>({ status: "idle" });

  useEffect(() => {
    function handleMessage(event: MessageEvent<ExtensionToTableDataMessage>) {
      const message = event.data;
      if (message.type === "tableDataLoading") {
        setState((prev) => {
          // If we have schema, stay in loadingData so we don't lose the header
          if (prev.status === "schema" || prev.status === "loadingData") {
            return { status: "loadingData", data: prev.data };
          }
          return { status: "loading", tableName: message.tableName };
        });
      } else if (message.type === "tableSchemaInit") {
        setState({ status: "schema", data: message.data });
      } else if (message.type === "tableDataInit") {
        setState({ status: "ready", data: message.data });
      } else if (message.type === "tableDataError") {
        setState({ status: "error", message: message.message });
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "ready" });

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (state.status === "idle") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div className="td-root">
        <div className="td-status">Loading {state.tableName}…</div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="td-root">
        <div className="td-error">
          <span className="td-error-icon">⚠</span>
          {state.message}
        </div>
        <button
          className="td-refresh-btn"
          onClick={() => vscode.postMessage({ type: "refresh" })}
        >
          Retry
        </button>
      </div>
    );
  }

  const data = state.status === "ready" ? state.data : state.data;
  const tableTitle = data.schema
    ? `${data.schema}.${data.tableName}`
    : data.tableName;

  return (
    <div className="td-root">
      <div className="td-header">
        <h1 className="td-title">{tableTitle}</h1>
        <button
          className="td-refresh-btn"
          onClick={() => vscode.postMessage({ type: "refresh" })}
          title="Refresh schema"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="td-meta">
        {data.columns.length} column{data.columns.length !== 1 ? "s" : ""}
      </div>

      <SchemaTable columns={data.columns} />

      {state.status === "schema" && (
        <div className="td-data-section">
          <button
            className="td-load-data-btn"
            onClick={() => vscode.postMessage({ type: "loadData" })}
          >
            Load Data
          </button>
        </div>
      )}

      {state.status === "loadingData" && (
        <div className="td-data-section">
          <div className="td-status">Loading data…</div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="td-data-section">
          <div className="td-data-meta">
            {state.data.rows.length} row{state.data.rows.length !== 1 ? "s" : ""}
          </div>
          {state.data.rows.length === 0 ? (
            <div className="td-empty">No rows returned.</div>
          ) : (
            <div className="td-table-wrapper">
              <table className="td-table">
                <thead>
                  <tr>
                    {state.data.columns.map((col) => (
                      <th key={col.name}>
                        <span className="td-col-name">{col.name}</span>
                        <span className="td-col-type">{col.baseType}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.data.rows.map((row, rowIdx) => (
                    <tr key={rowIdx}>
                      {(row as unknown[]).map((cell, cellIdx) => (
                        <td key={cellIdx}>{formatCell(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaTable({ columns }: { columns: { name: string; baseType: string }[] }) {
  return (
    <div className="td-schema-wrapper">
      <table className="td-schema-table">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name}>
              <td className="td-schema-col-name">{col.name}</td>
              <td className="td-schema-col-type">{col.baseType}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
