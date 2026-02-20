import { jt, t } from "ttag";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { Code } from "metabase/ui";
import type {
  Field,
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
} from "metabase-types/api";

type ErrorsCellProps = {
  source: ReplaceSourceColumnInfo | undefined;
  target: ReplaceSourceColumnInfo | undefined;
  errors: ReplaceSourceErrorType[];
};

export function ErrorsCell({ source, target, errors }: ErrorsCellProps) {
  return (
    <>
      {errors.map((error) => (
        <ErrorMessage
          key={error}
          source={source}
          target={target}
          error={error}
        />
      ))}
    </>
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
      return (
        <ForeignKeyMismatchError
          sourceFkFieldId={source?.fk_target_field_id}
          targetFkFieldId={target?.fk_target_field_id}
        />
      );
  }
}

type ForeignKeyMismatchErrorProps = {
  sourceFkFieldId: number | null | undefined;
  targetFkFieldId: number | null | undefined;
};

function ForeignKeyMismatchError({
  sourceFkFieldId,
  targetFkFieldId,
}: ForeignKeyMismatchErrorProps) {
  const { data: sourceFkField } = useGetFieldQuery(
    sourceFkFieldId != null ? { id: sourceFkFieldId } : skipToken,
  );
  const { data: targetFkField } = useGetFieldQuery(
    targetFkFieldId != null ? { id: targetFkFieldId } : skipToken,
  );

  if (sourceFkField != null && targetFkField != null) {
    return jt`This foreign key references ${(<FieldInfo key="target" field={targetFkField} />)} while the original column references ${(<FieldInfo key="source" field={sourceFkField} />)}.`;
  }

  return t`This foreign key references a different primary key than the original column.`;
}

type FieldInfoProps = {
  field: Field;
};

function FieldInfo({ field }: FieldInfoProps) {
  const parts: string[] = [];
  if (field.table != null) {
    if (field.table.schema != null) {
      parts.push(field.table.schema);
    }
    parts.push(field.table.display_name);
  }
  parts.push(field.display_name);

  return <Code>{parts.join(" / ")}</Code>;
}
