import { t } from "ttag";

import S from "metabase/css/components/jev-shimmer.module.css";
import { Button, Icon, KeyboardShortcut } from "metabase/ui";

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
