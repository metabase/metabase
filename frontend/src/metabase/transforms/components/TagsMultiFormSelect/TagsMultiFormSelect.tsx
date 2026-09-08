import { useField } from "formik";

import type { TransformTagId } from "metabase-types/api";
import { Input } from "metabase/ui";

import { TagMultiSelect } from "../TagMultiSelect";

type TagsMultiFormSelectProps = {
  name: string;
  label: string;
  description?: string;
};

export function TagsMultiFormSelect({
  name,
  label,
  description,
}: TagsMultiFormSelectProps) {
  const [{ value }, , { setValue }] = useField<TransformTagId[]>(name);

  return (
    <Input.Wrapper label={label} description={description}>
      <TagMultiSelect tagIds={value} onChange={setValue} />
    </Input.Wrapper>
  );
}
