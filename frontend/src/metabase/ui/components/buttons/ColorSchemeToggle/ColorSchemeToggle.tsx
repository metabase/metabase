import { ActionIcon, Tooltip } from "@mantine/core";
import { Icon } from "metabase/ui";
import { useColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider";
import { t } from "ttag";

interface ColorSchemeToggleProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  variant?: "subtle" | "light" | "filled" | "outline" | "default" | "transparent" | "gradient";
}

export function ColorSchemeToggle({
  size = "md",
  variant = "subtle"
}: ColorSchemeToggleProps) {
  const { colorScheme, resolvedColorScheme, toggleColorScheme } = useColorScheme();

  const getIcon = () => {
    switch (colorScheme) {
      case "light":
        return "sun";
      case "dark":
        return "moon";
      case "auto":
        return resolvedColorScheme === "dark" ? "moon" : "sun";
      default:
        return "sun";
    }
  };

  const getTooltipText = () => {
    switch (colorScheme) {
      case "light":
        return t`Switch to dark mode`;
      case "dark":
        return t`Switch to system preference`;
      case "auto":
        return t`Switch to light mode`;
      default:
        return t`Toggle theme`;
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