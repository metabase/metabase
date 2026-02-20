import type { ReactNode } from "react";
import { jt, t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Code } from "metabase/ui";
import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
  ReplaceSourceFieldInfo,
} from "metabase-types/api";

type ErrorsCellProps = {
  source: ReplaceSourceColumnInfo | undefined;
  target: ReplaceSourceColumnInfo | undefined;
  errors: ReplaceSourceErrorType[];
};

export function ErrorsCell({ source, target, errors }: ErrorsCellProps) {
  return (
    <Ellipsified>
      {errors.map((error) => (
        <ErrorMessage
          key={error}
          source={source}
          target={target}
          error={error}
        />
      ))}
    </Ellipsified>
  );
}

type ErrorMessageProps = {
  source: ReplaceSourceColumnInfo | undefined;
  target: ReplaceSourceColumnInfo | undefined;
  error: ReplaceSourceErrorType;
};

function ErrorMessage({ source, target, error }: ErrorMessageProps) {
  switch (error) {
    case "column-type-mismatch":
      return source?.database_type != null && target?.database_type != null
        ? jt`This column is ${(<Code key="target">{target.database_type}</Code>)} while the original column is ${(<Code key="source">{source.database_type}</Code>)}.`
        : t`This column is a different type than the original column.`;
    case "missing-primary-key":
      return t`This column is not a primary key, while the original column is.`;
    case "extra-primary-key":
      return t`This column is a primary key, while the original column is not.`;
    case "missing-foreign-key":
      return t`This column is not a foreign key, while the original column is.`;
    case "foreign-key-mismatch":
      return source?.target != null && target?.target != null
        ? jt`This foreign key references ${(<FieldInfo key="target" field={target.target} />)} while the original foreign key references ${(<FieldInfo key="source" field={source.target} />)}.`
        : t`This foreign key references a different primary key than the original foreign key.`;
  }
}

type FieldInfoProps = {
  field: ReplaceSourceFieldInfo;
};

function FieldInfo({ field }: FieldInfoProps) {
  const parts: ReactNode[] = [];
  if (field.table != null) {
    if (field.table.schema != null) {
      parts.push(field.table.schema);
    }
    parts.push(field.table.display_name);
  }
  parts.push(field.display_name);

  return <strong>{parts.join(" / ")}</strong>;
}
