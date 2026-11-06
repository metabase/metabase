import { t } from "ttag";

import { Box, Icon, Menu } from "metabase/ui";

type Props = {
  onClick: () => void;
};

export function GoalEntityPickerBackItem({ onClick }: Props) {
  return (
    <Box pb="xs" px="sm">
      <Menu.Item
        c="text-secondary"
        fz="sm"
        leftSection={<Icon name="chevronleft" size={12} />}
        onClick={onClick}
      >
        {t`Value from another question`}
      </Menu.Item>
    </Box>
  );
}
