import { diffWords } from "diff";

import type { DatasetQuery } from "metabase-types/api";

interface Props {
  diff: {
    before?: DatasetQuery;
    after?: DatasetQuery;
  };
}

export function TextDiff({ diff }: Props) {
  const { before, after } = diff;

  return (
    <div>
      &quot;
      {before != null && after != null ? (
        diffWords(String(before), String(after)).map((section, index) => (
          <span key={index}>
            {section.added ? (
              <strong>{section.value}</strong>
            ) : section.removed ? (
              <span style={{ textDecoration: "line-through" }}>
                {section.value}
              </span>
            ) : (
              <span>{section.value}</span>
            )}{" "}
          </span>
        ))
      ) : before != null ? (
        <span style={{ textDecoration: "line-through" }}>{String(before)}</span>
      ) : (
        <strong>{after != null ? String(after) : ""}</strong>
      )}
      &quot;
    </div>
  );
}
