import type {
  ReplaceSourceColumnInfo,
  ReplaceSourceErrorType,
} from "metabase-types/api";

type ErrorsCellProps = {
  source: ReplaceSourceColumnInfo | undefined;
  target: ReplaceSourceColumnInfo | undefined;
  errors: ReplaceSourceErrorType[];
};

export function ErrorsCell(_props: ErrorsCellProps) {
  return null;
}
