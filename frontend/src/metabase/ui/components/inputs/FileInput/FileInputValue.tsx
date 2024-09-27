import { Text } from "../../typography/Text";

import Styles from "./FileInput.module.css";
interface FileInputValueProps {
  value: File | File[] | null;
}

export const FileInputValue = ({ value }: FileInputValueProps) => {
  const text = Array.isArray(value)
    ? value.map(file => file.name).join(", ")
    : value?.name;

  return (
    <Text className={Styles.FileInputText} color="inherit">
      {text}
    </Text>
  );
};
