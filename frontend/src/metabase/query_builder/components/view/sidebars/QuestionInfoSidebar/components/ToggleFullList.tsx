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
  sliceLength: number;
  fullLength: number;
}) => {
  if (sliceLength === fullLength) {
    return null;
  }

  return (
    <Group spacing="sm" mt="sm" lh={1}>
      {
        <Text color="text-light" lh={1}>
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
