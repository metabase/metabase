import { useMemo } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { TextInput } from "metabase/ui";

interface BranchNameInputProps {
  existingBranches: string[];
  setValue: (value: string) => void;
  value: string;
}

export const BranchNameInput = (props: BranchNameInputProps) => {
  const { value, setValue, existingBranches: branches } = props;

  useDebounce(
    // Making sure branch name is valid.
    // Using debounce utility to avoid blocking the input and to avoid regex check overhead.
    () => {
      const strippedValue = value.replace(/[^a-zA-Z0-9-_.]/g, "");

      if (value !== strippedValue) {
        setValue(strippedValue);
      }
    },
    500,
    [setValue, value],
  );

  const error = useMemo(
    () => (branches.includes(value) ? t`Branch name already exists` : null),
    [branches, value],
  );

  return (
    <TextInput
      error={error}
      label={t`Name for your new branch`}
      mt="lg"
      onChange={(event) => setValue(event.target.value.trim())}
      placeholder={t`your-branch-name`}
      value={value}
      labelProps={{
        mb: "sm",
      }}
      maw="20rem"
    />
  );
};
