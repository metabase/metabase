import { useMemo } from "react";
import { c, t } from "ttag";

import { Box, Radio, Stack, Text } from "metabase/ui";

import type { ModalVariant, OptionValue } from "./utils";

interface BranchSwitchOptionsProps {
  currentBranch: string;
  handleOptionChange: (value: OptionValue) => void;
  optionValue?: OptionValue;
  variant: ModalVariant;
}

export const OutOfSyncOptions = (props: BranchSwitchOptionsProps) => {
  const { currentBranch, handleOptionChange, optionValue, variant } = props;
  const options = useMemo(() => {
    const branchNameCtx = c("{0} is the current GitHub branch name");
    const options: { value: OptionValue; label: string }[] = [
      {
        value: "push",
        label:
          variant === "switch-branch"
            ? branchNameCtx.t`Push changes to the current branch, ${currentBranch}`
            : branchNameCtx.t`Force push to ${currentBranch} (this will overwrite the remote branch)`,
      },
      {
        value: "new-branch",
        label: t`Create new branch and push changes there`,
      },
    ];

    if (variant === "switch-branch") {
      options.push({
        value: "discard",
        label: t`Discard these changes (can’t be undone)`,
      });
    }

    return options;
  }, [currentBranch, variant]);

  return (
    <Box mt="xl">
      <Text fw="bold">
        {variant === "switch-branch"
          ? t`You can push these changes, save them in a new branch, or discard them.`
          : t`You can forcibly push your changes or save them in a new branch.`}
      </Text>

      <Radio.Group
        onChange={(value) => handleOptionChange(value as OptionValue)}
        value={optionValue}
      >
        <Stack mt="sm" gap="sm">
          {options.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={option.label}
              pb="xs"
            />
          ))}
        </Stack>
      </Radio.Group>
    </Box>
  );
};
