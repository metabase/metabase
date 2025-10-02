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
  const { resolvedColorScheme, systemColorScheme, toggleColorScheme } =
    useColorScheme();

  const getIcon = () => {
    switch (resolvedColorScheme) {
      case "light":
        return "sun";
      case "dark":
        return "moon";
    }
  };

  const getTooltipBaseText = () => {
    switch (resolvedColorScheme) {
      case "light":
        return t`Switch to dark mode`;
      case "dark":
        return t`Switch to light mode`;
    }
  };
  const tooltipBaseText = getTooltipBaseText();
  const tooltipText =
    systemColorScheme !== resolvedColorScheme
      ? `${tooltipBaseText} ${t`(system preference)`}`
      : tooltipBaseText;

  return (
    <Tooltip label={tooltipText}>
      <ActionIcon
        onClick={toggleColorScheme}
        size={size}
        variant={variant}
        aria-label={tooltipText}
      >
        <Icon name={getIcon()} />
      </ActionIcon>
    </Tooltip>
  );
}
