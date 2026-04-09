import { c, t } from "ttag";

import { Button, Group, Text } from "metabase/ui";

export const ToggleFullList = ({
  isExpanded,
  toggle,
  sliceLength,
  fullLength,
}: {
  isExpanded: boolean;
  toggle: () => void;
  /** The length of the collapsed list, which shows a filtered portion (a
   * 'slice') of an array of items */
  sliceLength: number;
  fullLength: number;
}) => {
  if (sliceLength === fullLength) {
    return null;
  }

  return (
    <Group gap="sm" mt="sm" lh={1}>
      {
        <Text c="text-tertiary" lh={1}>
          {isExpanded
            ? c("{0} is a number").t`Showing all ${fullLength} questions`
            : c("The variables are numbers")
                .t`Showing ${sliceLength} of ${fullLength} questions`}
        </Text>
      }
      <Button p={0} lh={1} variant="subtle" onClick={toggle}>
        {isExpanded ? t`Show less` : t`Show all`}
      </Button>
    </Group>
  );
};
