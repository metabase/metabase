import { t } from "ttag";

import { Box, Divider, Icon, NavLink } from "metabase/ui";

import { useMiniPickerContext } from "../context";

export function MiniPickerFooter() {
  const { canBrowse, onBrowseAll } = useMiniPickerContext();

  if (!canBrowse) {
    return null;
  }
  return (
    <Box px="sm">
      <Divider />
      <NavLink
        mt="sm"
        variant="mb-light"
        leftSection={<Icon name="search" />}
        label={t`Browse all`}
        onClick={onBrowseAll}
      />
    </Box>
  );
}
