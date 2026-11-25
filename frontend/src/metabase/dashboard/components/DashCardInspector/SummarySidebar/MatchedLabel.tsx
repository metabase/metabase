import S from "./SummarySidebar.module.css";

type MatchedLabelProps = {
  label: string;
  query: string;
};

/** A one-line, ellipsized label with the first case-insensitive match of `query` in bold. */
export function MatchedLabel({ label, query }: MatchedLabelProps) {
  const needle = query.trim().toLowerCase();
  const start = needle.length > 0 ? label.toLowerCase().indexOf(needle) : -1;
  if (start < 0) {
    return <span className={S.matchedLabel}>{label}</span>;
  }
  const end = start + needle.length;
  return (
    <span className={S.matchedLabel}>
      {label.slice(0, start)}
      <strong className={S.matchedLabelMatch}>{label.slice(start, end)}</strong>
      {label.slice(end)}
    </span>
  );
}
