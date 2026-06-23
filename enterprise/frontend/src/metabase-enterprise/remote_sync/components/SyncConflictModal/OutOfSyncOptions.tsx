import { useMemo } from "react";
import { c, t } from "ttag";

import { Box, Radio, Stack, Text } from "metabase/ui";
import type { RemoteSyncConflictVariant } from "metabase-types/api";

import type { OptionValue } from "./utils";

interface BranchSwitchOptionsProps {
  currentBranch: string;
  handleOptionChange: (value: OptionValue) => void;
  isRemoteSyncReadOnly: boolean;
  optionValue?: OptionValue;
  variant: RemoteSyncConflictVariant;
  /** When true (push variant only), offer a "Merge changes" option. */
  canMerge?: boolean;
}

interface OutOfSyncOption {
  value: OptionValue;
  label: string;
}

/**
 * Options that permanently destroy content: force-push wipes remote files that aren't here, discard
 * throws away local changes. Everything else (merge, push, new branch) keeps all content. Used to split
 * the choices into a safe and a destructive group.
 */
const DESTRUCTIVE_OPTIONS = new Set<OptionValue>(["force-push", "discard"]);

export const OutOfSyncOptions = (props: BranchSwitchOptionsProps) => {
  const {
    currentBranch,
    handleOptionChange,
    isRemoteSyncReadOnly,
    optionValue,
    variant,
    canMerge,
  } = props;

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
        .t`Force push to ${currentBranch}, discarding and overwriting everything (can’t be undone)`,
    };
    // Push merges and pushes the result; pull merges into local only (the push happens later).
    const mergeOption: OutOfSyncOption = {
      value: "merge",
      label:
        variant === "pull"
          ? t`Merge the remote changes into your local content`
          : t`Merge the remote changes with yours and push`,
    };
    const discardOption: OutOfSyncOption = {
      value: "discard",
      label: t`Delete unsynced changes (can’t be undone)`,
    };

    switch (variant) {
      case "push":
        return canMerge
          ? [mergeOption, newBranchOption, forcePushOption]
          : [newBranchOption, forcePushOption];
      case "switch-branch":
        return [pushOption, newBranchOption, discardOption];
      case "setup":
        return isRemoteSyncReadOnly
          ? [discardOption]
          : [newBranchOption, discardOption];
      default: // pull
        if (isRemoteSyncReadOnly) {
          return [discardOption];
        }
        return canMerge
          ? [mergeOption, forcePushOption, newBranchOption, discardOption]
          : [forcePushOption, newBranchOption, discardOption];
    }
  }, [currentBranch, isRemoteSyncReadOnly, variant, canMerge]);

  const safeOptions = options.filter(
    (option) => !DESTRUCTIVE_OPTIONS.has(option.value),
  );
  const destructiveOptions = options.filter((option) =>
    DESTRUCTIVE_OPTIONS.has(option.value),
  );

  return (
    <Box mt="xl">
      <Text fw="bold" mb="sm" pb="xs">{t`Choose how to proceed:`}</Text>
      <Radio.Group
        onChange={(value) => handleOptionChange(value as OptionValue)}
        value={optionValue}
      >
        <Stack gap="lg">
          {safeOptions.length > 0 && (
            <OptionGroup title={t`Keep all changes`} options={safeOptions} />
          )}
          {destructiveOptions.length > 0 && (
            <OptionGroup
              title={t`Permanently lose changes (can’t be undone)`}
              destructive
              options={destructiveOptions}
            />
          )}
        </Stack>
      </Radio.Group>
    </Box>
  );
};

interface OptionGroupProps {
  title: string;
  options: OutOfSyncOption[];
  destructive?: boolean;
}

const OptionGroup = ({ title, options, destructive }: OptionGroupProps) => (
  <Box>
    <Text
      size="sm"
      fw="bold"
      c={destructive ? "error" : "text-secondary"}
      mb="sm"
    >
      {title}
    </Text>
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
  </Box>
);
