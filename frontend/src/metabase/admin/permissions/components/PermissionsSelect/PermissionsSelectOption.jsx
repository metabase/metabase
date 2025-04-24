import PropTypes from "prop-types";
import { useState } from "react";

import { PLUGIN_PERMISSIONS } from "metabase/plugins";
import { Box, Tooltip } from "metabase/ui";

import {
  IconContainer,
  PermissionsSelectLabel,
  PermissionsSelectOptionRoot,
} from "./PermissionsSelectOption.styled";

export const optionShape = {
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.element]).isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string.isRequired,
};

const propTypes = {
  ...optionShape,
  className: PropTypes.string,
  hint: PropTypes.string,
};

export function PermissionsSelectOption({
  label,
  icon: iconName,
  iconColor,
  className,
  hint,
}) {
  const [shouldShowTooltip, setShouldShowTooltip] = useState(false);

  // NOTE: this design is for performance reasons. all icons used by this
  // component must be registered in the following plugin with a key of the
  // icon name and and a value of the relative path the browser can use to load
  // an svg icon from. since this component can be rendered several thousand times
  // on a page, rendering individual svg tags is very expensive (making the page
  // some ~4x slower).
  const iconPath = PLUGIN_PERMISSIONS.permissionIconPaths[iconName];
  if (!iconPath) {
    console.warn(
      "You have failed to register the path for the permission icon: " +
        iconName,
    );
  }

  const icon = (
    <IconContainer color={iconColor}>
      <Box
        h="1rem"
        w="1rem"
        bg="white"
        style={{ maskImage: `url("${iconPath}")` }}
      />
    </IconContainer>
  );

  // NOTE: optional rendering of tooltip provides performance gains due to # rendered
  return (
    <PermissionsSelectOptionRoot
      className={className}
      onMouseEnter={() => setShouldShowTooltip(true)}
      onMouseLeave={() => setShouldShowTooltip(false)}
    >
      {hint ? (
        <Tooltip label={hint} disabled={!hint} opened={shouldShowTooltip}>
          {icon}
        </Tooltip>
      ) : (
        icon
      )}

      <PermissionsSelectLabel>{label}</PermissionsSelectLabel>
    </PermissionsSelectOptionRoot>
  );
}

PermissionsSelectOption.propTypes = propTypes;
