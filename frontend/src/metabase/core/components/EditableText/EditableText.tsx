import React, { ChangeEvent, forwardRef, HTMLAttributes, Ref } from "react";
import {
  EditableTextArea,
  EditableTextContent,
  EditableTextRoot,
} from "./EditableText.styled";

export type EditableTextAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface EditableTextProps extends EditableTextAttributes {
  value?: string;
  placeholder?: string;
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

const EditableText = forwardRef(function EditableText(
  { value, placeholder, onChange, ...props }: EditableTextProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <EditableTextRoot ref={ref} {...props}>
      <EditableTextContent>{value} </EditableTextContent>
      <EditableTextArea
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
    </EditableTextRoot>
  );
});

export default EditableText;
