import { t } from "ttag";

import { Box, Divider, Icon, NavLink } from "metabase/ui";

import { useMiniPickerContext } from "../context";

export function MiniPickerFooter() {
  const { canBrowse, setShouldBrowse } = useMiniPickerContext();

  if (!canBrowse) {
    return null;
  }
  return (
    <Box pb="sm">
      <Divider />
      <NavLink
        mt="sm"
        variant="mb-light"
        leftSection={<Icon name="search" />}
        label={t`Browse all`}
        onClick={() => setShouldBrowse(true)}
      />
    </Box>
  );
}
