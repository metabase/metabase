import { Text } from "@mantine/core";

interface FileInputValueProps {
  value: File | File[] | null;
}

export const FileInputValue = ({ value }: FileInputValueProps) => {
  const text = Array.isArray(value)
    ? value.map(file => file.name).join(", ")
    : value?.name;

  return (
    <Text
      color="inherit"
      style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </Text>
  );
};
