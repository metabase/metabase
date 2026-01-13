import { useMemo } from "react";
import { c, t } from "ttag";

import { Box, Radio, Stack, Text } from "metabase/ui";

import type { OptionValue, SyncConflictVariant } from "./utils";

interface BranchSwitchOptionsProps {
  currentBranch: string;
  handleOptionChange: (value: OptionValue) => void;
  optionValue?: OptionValue;
  variant: SyncConflictVariant;
}

interface OutOfSyncOption {
  value: OptionValue;
  label: string;
}

export const OutOfSyncOptions = (props: BranchSwitchOptionsProps) => {
  const { currentBranch, handleOptionChange, optionValue, variant } = props;
  const options = useMemo<OutOfSyncOption[]>(() => {
    const newBranchOption: OutOfSyncOption = {
      value: "new-branch",
      label: t`Create a new branch and push changes there`,
    };
    const pushOption: OutOfSyncOption = {
      value: "push",
      label: c("{0} is the current GitHub branch name")
        .t`Push changes to the current branch, ${currentBranch}`,
    };
    const forcePushOption: OutOfSyncOption = {
      value: "force-push",
      label: c("{0} is the current GitHub branch name")
        .t`Force push to ${currentBranch} (this will overwrite the remote branch)`,
    };
    const discardOption: OutOfSyncOption = {
      value: "discard",
      label: t`Delete unsynced changes (can’t be undone)`,
    };

    switch (variant) {
      case "push":
        return [newBranchOption, forcePushOption];
      case "switch-branch":
        return [pushOption, newBranchOption, discardOption];
      default: // pull
        return [forcePushOption, newBranchOption, discardOption];
    }
  }, [currentBranch, variant]);

  return (
    <Box mt="xl">
      <Text fw="bold" mb="sm" pb="xs">{t`Choose how to proceed:`}</Text>
      <Radio.Group
        onChange={(value) => handleOptionChange(value as OptionValue)}
        value={optionValue}
      >
        <Stack gap="sm">
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
