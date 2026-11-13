import { t } from "ttag";

import { ActionIcon, Box, Icon, UnstyledButton } from "metabase/ui";

import S from "./DraftFormulaChip.module.css";

export type DraftFormulaChipProps = {
  name: string;
  onFocus: () => void;
  onCancel: () => void;
};

export function DraftFormulaChip({
  name,
  onFocus,
  onCancel,
}: DraftFormulaChipProps) {
  return (
    <Box className={S.root} data-testid="summary-well-placeholder">
      <UnstyledButton
        className={S.button}
        aria-label={t`Edit the new formula in the formula bar`}
        onClick={onFocus}
      >
        <Icon name="function" size={12} />
        <span className={S.label}>{name || t`New formula`}</span>
      </UnstyledButton>
      <ActionIcon
        className={S.remove}
        size="sm"
        variant="subtle"
        c="inherit"
        aria-label={t`Cancel the new formula`}
        onClick={onCancel}
      >
        <Icon name="close" size={12} />
      </ActionIcon>
    </Box>
  );
}
