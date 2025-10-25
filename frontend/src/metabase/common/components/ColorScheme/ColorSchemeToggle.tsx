import { t } from "ttag";

import { ActionIcon, type ActionIconProps, Icon, Tooltip } from "metabase/ui";
import { useColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider";
import type { ResolvedColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider/ColorSchemeProvider";

const iconMap: Record<ResolvedColorScheme, "sun" | "moon"> = {
  light: "sun",
  dark: "moon",
};

const getTooltipText = (
  scheme: ResolvedColorScheme,
  systemScheme: ResolvedColorScheme,
): string => {
  const baseText =
    scheme === "dark" ? t`Switch to light mode` : t`Switch to dark mode`;

  return systemScheme !== scheme
    ? `${baseText} ${t`(system preference)`}`
    : baseText;
};

export function ColorSchemeToggle(props: ActionIconProps & { id?: string }) {
  const { resolvedColorScheme, systemColorScheme, toggleColorScheme } =
    useColorScheme();

  const tooltipText = getTooltipText(resolvedColorScheme, systemColorScheme);

  return (
    <Tooltip label={tooltipText}>
      <ActionIcon
        onClick={toggleColorScheme}
        aria-label={tooltipText}
        {...props}
      >
        <Icon name={iconMap[resolvedColorScheme]} />
      </ActionIcon>
    </Tooltip>
  );
}
