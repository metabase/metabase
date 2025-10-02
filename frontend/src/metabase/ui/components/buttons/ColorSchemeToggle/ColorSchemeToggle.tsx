import { ActionIcon, Tooltip } from "@mantine/core";
import { t } from "ttag";

import { Icon } from "metabase/ui";
import { useColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider";

interface ColorSchemeToggleProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "subtle" | "viewHeader";
}

export function ColorSchemeToggle({
  size = "md",
  variant = "subtle",
}: ColorSchemeToggleProps) {
  const { resolvedColorScheme, toggleColorScheme } = useColorScheme();

  const getIcon = () => {
    switch (resolvedColorScheme) {
      case "light":
        return "sun";
      case "dark":
        return "moon";
    }
  };

  const getTooltipText = () => {
    switch (resolvedColorScheme) {
      case "light":
        return t`Switch to dark mode`;
      case "dark":
        return t`Switch to light mode`;
    }
  };

  return (
    <Tooltip label={getTooltipText()}>
      <ActionIcon
        onClick={toggleColorScheme}
        size={size}
        variant={variant}
        aria-label={getTooltipText()}
      >
        <Icon name={getIcon()} />
      </ActionIcon>
    </Tooltip>
  );
}
