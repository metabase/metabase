import { c, t } from "ttag";

import { Box, Radio, Stack, Text } from "metabase/ui";

export type OptionValue = "push" | "new-branch" | "discard";

interface BranchSwitchOptionsProps {
  currentBranch: string;
  handleOptionChange: (value: OptionValue) => void;
  optionValue?: OptionValue;
}

export const BranchSwitchOptions = (props: BranchSwitchOptionsProps) => {
  const { currentBranch, handleOptionChange, optionValue } = props;

  return (
    <Box mt="xl">
      <Text fw="bold">
        {t`You can push these changes, save them in a new branch, or discard them.`}
      </Text>

      <Radio.Group
        onChange={(value) => handleOptionChange(value as OptionValue)}
        value={optionValue}
      >
        <Stack mt="sm" gap="sm">
          <Radio
            value="push"
            label={c("{0} is the current GitHub branch name")
              .t`Push changes to the current branch, ${currentBranch}`}
            pb="xs"
          />
          <Radio
            value="new-branch"
            label={t`Create new branch and push changes there`}
            pb="xs"
          />
          <Radio
            value="discard"
            label={t`Discard these changes (can’t be undone)`}
            pb="xs"
          />
        </Stack>
      </Radio.Group>
    </Box>
  );
};
