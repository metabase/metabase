import Table from "metabase-lib/metadata/Table";

export interface WritebackFormProps {
  table: Table;
  row?: unknown[];
  type?: "insert" | "update";
  mode?: "row" | "bulk";
  onSubmit: (values: Record<string, unknown>) => void;

  // Form props
  isModal?: boolean;
}

function WritebackForm(props: WritebackFormProps) {
  return null;
}

export default WritebackForm;
