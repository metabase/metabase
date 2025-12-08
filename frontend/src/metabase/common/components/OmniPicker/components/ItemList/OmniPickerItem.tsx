import { getIcon } from "metabase/lib/icon";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Box, Flex, Icon, NavLink, type NavLinkProps } from "metabase/ui";

import type { OmniPickerCollectionItem, OmniPickerItem } from "../../types";

export function OmniPickerItem({
  model,
  name,
  onClick,
  isFolder,
  isHidden,
  isDisabled,
  moderatedStatus,
  ...navLinkProps
}: {
  name: string;
  model?: OmniPickerItem["model"];
  display?: OmniPickerCollectionItem["display"];
  onClick?: () => void,
  isFolder?: boolean,
  isHidden?: boolean,
  moderatedStatus?: OmniPickerCollectionItem["moderated_status"],
  isDisabled?: boolean,
} & NavLinkProps) {
  if (isHidden) {
    return null;
  }
  return (
    <Box px="sm">
      <NavLink
        w="auto"
        mb={0}
        data-testid="picker-item"
        key={`${model}-${name}`}
        leftSection={model ? <Icon {...getIcon({ model })} /> : undefined}
        rightSection={isFolder ? <Icon name="chevronright" size={10} /> : undefined}
        onClick={onClick}
        variant="mb-light"
        label={
          <Flex align="center">
            {name}{" "}
            <PLUGIN_MODERATION.ModerationStatusIcon
              status={moderatedStatus}
              filled
              size={14}
              ml="0.5rem"
            />
          </Flex>
        }
        {...navLinkProps}
      />
    </Box>
  );
}
