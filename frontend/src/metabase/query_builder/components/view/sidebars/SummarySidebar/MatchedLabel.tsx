import S from "./SummarySidebar.module.css";

type MatchedLabelProps = {
  label: string;
  searchText: string;
};

/** A one-line, ellipsized label with the first case-insensitive match of `searchText` in bold. */
export function MatchedLabel({ label, searchText }: MatchedLabelProps) {
  const needle = searchText.trim().toLowerCase();
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
