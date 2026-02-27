import type { ReactNode } from "react";
import type {
  NotebookData,
  NotebookStepData,
  NotebookClauseData,
} from "../../../src/shared-types";
import { vscode } from "../vscode";

interface ReadOnlyNotebookProps {
  data: NotebookData;
}

export function ReadOnlyNotebook({ data }: ReadOnlyNotebookProps) {
  if (data.queryType === "native" && data.nativeSql) {
    return (
      <div className="notebook-steps">
        <Step variant="brand" icon={<CodeIcon />} title="Native Query">
          <SqlBlock sql={data.nativeSql} />
        </Step>
      </div>
    );
  }

  if (data.queryType === "python" && data.nativeSql) {
    return (
      <div className="notebook-steps">
        <Step variant="brand" icon={<CodeIcon />} title="Python Query">
          <pre className="notebook-code">{data.nativeSql}</pre>
        </Step>
      </div>
    );
  }

  if (!data.steps || data.steps.length === 0) {
    return <p className="notebook-empty-state">Unable to parse query</p>;
  }

  return (
    <div className="notebook-steps">
      {data.steps.map((step, stepIndex) => (
        <StepRenderer key={stepIndex} step={step} />
      ))}
    </div>
  );
}

const STEP_CONFIG: Record<
  string,
  { icon: ReactNode; variant: string; label: string }
> = {
  data: { icon: <TableIcon />, variant: "brand", label: "Data" },
  filter: { icon: <FilterIcon />, variant: "filter", label: "Filter" },
  summarize: {
    icon: <SummarizeIcon />,
    variant: "summarize",
    label: "Summarize",
  },
  breakout: { icon: <BreakoutIcon />, variant: "breakout", label: "Group by" },
  sort: { icon: <SortIcon />, variant: "muted", label: "Sort" },
  limit: { icon: <LimitIcon />, variant: "muted", label: "Row limit" },
  join: { icon: <JoinIcon />, variant: "brand", label: "Join" },
  expression: {
    icon: <ExpressionIcon />,
    variant: "muted",
    label: "Custom column",
  },
};

function StepRenderer({ step }: { step: NotebookStepData }) {
  const config = STEP_CONFIG[step.type] ?? {
    icon: null,
    variant: "muted",
    label: step.type,
  };

  const title = step.title ?? config.label;

  return (
    <Step variant={config.variant} icon={config.icon} title={title}>
      {step.clauses.map((clause, clauseIndex) => (
        <ClauseRenderer
          key={clauseIndex}
          clause={clause}
          variant={config.variant}
        />
      ))}
    </Step>
  );
}

function ClauseRenderer({
  clause,
  variant,
}: {
  clause: NotebookClauseData;
  variant: string;
}) {
  const handleClick =
    clause.fieldRef && clause.fieldRef.length >= 3
      ? () => {
          if (clause.fieldRef!.length >= 4) {
            vscode.postMessage({ type: "openField", ref: clause.fieldRef! });
          } else {
            vscode.postMessage({ type: "openTable", ref: clause.fieldRef! });
          }
        }
      : undefined;

  if (handleClick) {
    return (
      <a
        className={`notebook-pill notebook-pill--${variant}`}
        onClick={handleClick}
      >
        {clause.displayName}
      </a>
    );
  }

  return (
    <span className={`notebook-pill notebook-pill--${variant}`}>
      {clause.displayName}
    </span>
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
      <div className={`notebook-step-label notebook-step-label--${variant}`}>
        {icon}
        {title}
      </div>
      <div className={`notebook-step-cell notebook-step-cell--${variant}`}>
        {children}
      </div>
    </div>
  );
}

// SQL syntax highlighting (reused from TransformPreview)

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

  collect(multiLineComments, "notebook-sql-comment");
  collect(singleLineComments, "notebook-sql-comment");
  collect(strings, "notebook-sql-string");
  collect(keywords, "notebook-sql-keyword");
  collect(numbers, "notebook-sql-number");

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
    <pre className="notebook-sql">
      <code>{elements}</code>
    </pre>
  );
}

// Icons

function TableIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <path d="M2 6h12M2 10h12M6 2v12" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12l-4.5 5.25V13l-3-1.5V8.25L2 3Z" />
    </svg>
  );
}

function SummarizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13V8M8 13V3M13 13V6" />
    </svg>
  );
}

function BreakoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3v10M4 3L2 5M4 3l2 2M12 13V3M12 13l-2-2M12 13l2-2" />
    </svg>
  );
}

function LimitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h10M3 8h7M3 12h4" />
    </svg>
  );
}

function JoinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="8" r="4" />
      <circle cx="10" cy="8" r="4" />
    </svg>
  );
}

function ExpressionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4L1 8l4 4M11 4l4 4-4 4" />
    </svg>
  );
}
