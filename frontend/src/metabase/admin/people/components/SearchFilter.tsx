import type { ChangeEvent } from "react";
import _ from "underscore";

import { Icon, Input } from "metabase/ui";

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
  const debouncedOnChange = _.debounce(
    (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    200,
  );

  return (
    <Input
      miw="14rem"
      fz="sm"
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={debouncedOnChange}
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
