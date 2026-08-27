import { useField } from "formik";
import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { MultiSelect, TagsInput } from "metabase/ui";
import type { TableId } from "metabase-types/api";

// Form value is a comma-separated string of physical column names; this adapter presents it as a
// column multi-select. Labels use the column display name (matching the checkpoint field select),
// while the stored value stays the physical name the merge SQL needs.
function UniqueKeyColumnSelect({
  options,
  readOnly,
}: {
  options: { value: string; label: string }[];
  readOnly?: boolean;
}) {
  const [field, , helpers] = useField<string>("uniqueKey");
  const value = field.value
    ? field.value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    : [];

  return (
    <MultiSelect
      label={t`Merge key`}
      description={t`Optional. Output columns to upsert on.`}
      placeholder={t`Pick columns`}
      data={options}
      value={value}
      onChange={(names) => helpers.setValue(names.join(", "))}
      disabled={readOnly}
      searchable
      clearable
    />
  );
}

// Used before the target table exists, so we can't offer a column picker. Free-text entry that turns
// each comma- or Enter-separated name into a chip, like the column selector once the table exists.
function MergeKeyTagsInput({ readOnly }: { readOnly?: boolean }) {
  const [field, , helpers] = useField<string>("uniqueKey");
  const value = field.value
    ? field.value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
    : [];

  return (
    <TagsInput
      label={t`Merge key`}
      description={t`Optional. Output columns to upsert on. Type a column name and press comma or enter.`}
      placeholder={t`e.g. id`}
      value={value}
      onChange={(names) => helpers.setValue(names.join(", "))}
      splitChars={[","]}
      disabled={readOnly}
      clearable
    />
  );
}

// The merge key input: a column picker once the target table exists, otherwise free-text chips.
export function UniqueKeyField({
  targetTableId,
  readOnly,
}: {
  targetTableId?: TableId;
  readOnly?: boolean;
}) {
  const { data: table } = useGetTableQueryMetadataQuery(
    targetTableId != null ? { id: targetTableId } : skipToken,
  );
  const options =
    table?.fields?.map((fieldObj) => ({
      value: fieldObj.name,
      label: fieldObj.display_name ?? fieldObj.name,
    })) ?? [];

  if (options.length > 0) {
    return <UniqueKeyColumnSelect options={options} readOnly={readOnly} />;
  }

  return <MergeKeyTagsInput readOnly={readOnly} />;
}
