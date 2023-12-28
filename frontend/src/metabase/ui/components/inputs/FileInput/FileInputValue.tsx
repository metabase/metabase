import { FileInputText } from "./FileInputValue.styled";

interface FileInputValueProps {
  value: File | File[] | null;
}

export const FileInputValue = ({ value }: FileInputValueProps) => {
  const text = Array.isArray(value)
    ? value.map(file => file.name).join(", ")
    : value?.name;

  return <FileInputText color="inherit">{text}</FileInputText>;
};
