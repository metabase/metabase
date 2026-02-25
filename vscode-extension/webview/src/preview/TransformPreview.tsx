import { useEffect, useState, type ReactNode } from "react";
import type {
  TransformPreviewData,
  ExtensionToPreviewMessage,
  FieldReference,
  StructuredTransformQuery,
  NativeTransformQuery,
} from "../../../src/shared-types";
import {
  TableIcon,
  FilterIcon,
  ChartLineIcon,
  BoxesIcon,
  CodeIcon,
  DatabaseIcon,
  FileTextIcon,
  LinkIcon,
  HashIcon,
  ArrowUpDownIcon,
  ArrowRightIcon,
  PlayIcon,
} from "./icons";
import { vscode } from "../vscode";

export function TransformPreview() {
  const [data, setData] = useState<TransformPreviewData | null>(null);

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

  return (
    <div className="preview-root">
      <PreviewHeader data={data} />
      <PreviewToolbar data={data} />
      <PreviewSteps data={data} />
      <PreviewFooter target={data.target} />
    </div>
  );
}

function PreviewHeader({ data }: { data: TransformPreviewData }) {
  const database = data.query?.database ?? "";

  return (
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
  );
}

function PreviewToolbar({ data }: { data: TransformPreviewData }) {
  const canRun = data.sourceQueryType !== "query";
  const canEdit = data.sourceQueryType === "native" || data.sourceQueryType === "python";

  return (
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
  );
}

function PreviewSteps({ data }: { data: TransformPreviewData }) {
  if (!data.query) {
    return <p className="preview-empty-state">Unable to parse query</p>;
  }

  if (data.query.type === "native") {
    return (
      <div className="preview-steps">
        <NativeQueryStep query={data.query} />
      </div>
    );
  }

  return (
    <div className="preview-steps">
      <StructuredQuerySteps query={data.query} />
    </div>
  );
}

function NativeQueryStep({ query }: { query: NativeTransformQuery }) {
  return (
    <Step variant="brand" icon={<CodeIcon size={14} />} title="Native Query">
      <SqlBlock sql={query.sql} />
    </Step>
  );
}

function StructuredQuerySteps({ query }: { query: StructuredTransformQuery }) {
  return (
    <>
      <Step variant="brand" icon={<TableIcon size={14} />} title={query.sourceTable.display}>
        <Pill
          variant="brand"
          onClick={() => vscode.postMessage({ type: "openTable", ref: query.sourceTable.ref })}
        >
          {query.sourceTable.display}
        </Pill>
      </Step>

      {query.filters.length > 0 && (
        <Step variant="filter" icon={<FilterIcon size={14} />} title="Filter">
          {query.filters.map((filter, index) => (
            <Pill key={index} variant="filter">
              <FieldRefLink field={filter.column} />
              <span className="preview-pill-op">{filter.operator}</span>
              <span className="preview-pill-val">{filter.value}</span>
            </Pill>
          ))}
        </Step>
      )}

      {query.aggregations.length > 0 && (
        <Step variant="summarize" icon={<ChartLineIcon size={14} />} title="Summarize">
          {query.aggregations.map((aggregation, index) => (
            <Pill key={index} variant="summarize">
              {aggregation.operator}
              {aggregation.column && (
                <>
                  {" of "}
                  <FieldRefLink field={aggregation.column} />
                </>
              )}
            </Pill>
          ))}
        </Step>
      )}

      {query.breakouts.length > 0 && (
        <Step variant="breakout" icon={<BoxesIcon size={14} />} title="Group by">
          {query.breakouts.map((breakout, index) => (
            <Pill key={index} variant="breakout">
              <FieldRefLink field={breakout} />
            </Pill>
          ))}
        </Step>
      )}

      {query.orderBy.length > 0 && (
        <Step variant="muted" icon={<ArrowUpDownIcon size={14} />} title="Sort">
          {query.orderBy.map((order, index) => (
            <Pill key={index} variant="muted">
              <FieldRefLink field={order.column} />
              <span className="preview-pill-dir">
                {order.direction === "desc" ? "descending" : "ascending"}
              </span>
            </Pill>
          ))}
        </Step>
      )}

      {query.limit !== null && (
        <Step variant="muted" icon={<HashIcon size={14} />} title="Row limit">
          <Pill variant="muted">{query.limit}</Pill>
        </Step>
      )}
    </>
  );
}

function Step({
  variant,
  icon,
  title,
  children,
}: {
  variant: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className={`preview-step-label preview-step-label--${variant}`}>
        {icon}
        {title}
      </div>
      <div className={`preview-step-cell preview-step-cell--${variant}`}>
        {children}
      </div>
    </div>
  );
}

function Pill({
  variant,
  children,
  onClick,
}: {
  variant: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <a className={`preview-pill preview-pill--${variant}`} onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <span className={`preview-pill preview-pill--${variant}`}>
      {children}
    </span>
  );
}

function FieldRefLink({ field }: { field: FieldReference }) {
  if (field.ref.length >= 4) {
    return (
      <button
        className="preview-pill-ref"
        onClick={(event) => {
          event.stopPropagation();
          vscode.postMessage({ type: "openField", ref: field.ref });
        }}
      >
        {field.display}
      </button>
    );
  }

  if (field.ref.length >= 3) {
    return (
      <button
        className="preview-pill-ref"
        onClick={(event) => {
          event.stopPropagation();
          vscode.postMessage({ type: "openTable", ref: field.ref });
        }}
      >
        {field.display}
      </button>
    );
  }

  return <>{field.display}</>;
}

interface SqlToken {
  start: number;
  end: number;
  className: string;
  text: string;
}

function tokenizeSql(sql: string): SqlToken[] {
  const keywords =
    /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|EXISTS|BETWEEN|LIKE|ILIKE|IS|NULL|AS|ON|JOIN|INNER|LEFT|RIGHT|OUTER|FULL|CROSS|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|VIEW|WITH|CASE|WHEN|THEN|ELSE|END|ASC|DESC|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|NULLIF|TRUE|FALSE)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;
  const singleLineComments = /(--[^\n]*)/g;
  const multiLineComments = /(\/\*[\s\S]*?\*\/)/g;

  const tokens: SqlToken[] = [];

  function collect(pattern: RegExp, className: string) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        className,
        text: match[0],
      });
    }
  }

  collect(multiLineComments, "preview-sql-comment");
  collect(singleLineComments, "preview-sql-comment");
  collect(strings, "preview-sql-string");
  collect(keywords, "preview-sql-keyword");
  collect(numbers, "preview-sql-number");

  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  const filtered: SqlToken[] = [];
  let lastEnd = 0;
  for (const token of tokens) {
    if (token.start >= lastEnd) {
      filtered.push(token);
      lastEnd = token.end;
    }
  }

  return filtered;
}

function SqlBlock({ sql }: { sql: string }) {
  const tokens = tokenizeSql(sql);
  const elements: ReactNode[] = [];
  let cursor = 0;

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (cursor < token.start) {
      elements.push(sql.slice(cursor, token.start));
    }
    elements.push(
      <span key={index} className={token.className}>
        {token.text}
      </span>,
    );
    cursor = token.end;
  }

  if (cursor < sql.length) {
    elements.push(sql.slice(cursor));
  }

  return (
    <pre className="preview-sql">
      <code>{elements}</code>
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
      <Pill
        variant="brand"
        onClick={() => vscode.postMessage({ type: "openTable", ref })}
      >
        {tableName}
      </Pill>
      <span className="preview-badge">
        <DatabaseIcon size={12} />
        {target.database}
      </span>
    </footer>
  );
}
