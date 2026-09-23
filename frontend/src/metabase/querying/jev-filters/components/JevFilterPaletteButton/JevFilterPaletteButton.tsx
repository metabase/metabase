import { t } from "ttag";

import { Button, Icon, KeyboardShortcut } from "metabase/ui";

import S from "./JevFilterPaletteButton.module.css";

interface JevFilterPaletteButtonProps {
  onClick: () => void;
}

export function JevFilterPaletteButton({
  onClick,
}: JevFilterPaletteButtonProps) {
  return (
    <Button
      variant="subtle"
      size="compact-sm"
      classNames={{ label: S.label }}
      leftSection={<Icon name="sparkles" className={S.icon} />}
      rightSection={<KeyboardShortcut shortcut="$mod+f" />}
      onClick={onClick}
      data-testid="jev-filter-palette-button"
    >
      {t`Filter with Jev`}
    </Button>
  );
}
