import { Ellipsified } from "metabase/ui";

import S from "./SummarySidebar.module.css";

type MatchedLabelProps = {
  label: string;
  searchText: string;
};

export function MatchedLabel({ label, searchText }: MatchedLabelProps) {
  const needle = searchText.trim().toLowerCase();
  const start = needle.length > 0 ? label.toLowerCase().indexOf(needle) : -1;
  if (start < 0) {
    return <Ellipsified>{label}</Ellipsified>;
  }
  const end = start + needle.length;
  return (
    <Ellipsified tooltip={label}>
      {label.slice(0, start)}
      <strong className={S.matchedLabelMatch}>{label.slice(start, end)}</strong>
      {label.slice(end)}
    </Ellipsified>
  );
}
