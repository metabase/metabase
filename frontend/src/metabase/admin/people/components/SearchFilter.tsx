import { Icon, Input, TextInput } from "metabase/ui";

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export const SearchFilter = ({
  value,
  onChange,
  placeholder,
}: SearchFilterProps) => {
  return (
    <TextInput
      w="100%"
      fz="sm"
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      leftSection={<Icon c="text-secondary" name="search" size={16} />}
      rightSectionPointerEvents="all"
      rightSection={
        value === "" ? (
          <div /> // rendering null causes width change
        ) : (
          <Input.ClearButton
            c={"text-secondary"}
            onClick={() => onChange("")}
          />
        )
      }
    />
  );
};
