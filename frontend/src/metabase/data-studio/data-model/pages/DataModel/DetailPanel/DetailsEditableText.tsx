import {
  EditableText,
  type EditableTextProps,
} from "metabase/common/components/EditableText";

// Pulls EditableText's own padding and border into the row's padding so its
// text lines up with the plain values in the other rows
const EDITABLE_TEXT_OFFSET = "-0.3125rem";

/** Click-to-edit value for a `DetailsRow`, aligned with the row's plain values. */
export function DetailsEditableText(props: EditableTextProps) {
  return <EditableText m={EDITABLE_TEXT_OFFSET} {...props} />;
}
