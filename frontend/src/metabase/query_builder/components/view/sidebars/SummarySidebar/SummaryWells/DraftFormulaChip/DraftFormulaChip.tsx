import { type Ref, useImperativeHandle, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Ellipsified,
  FixedSizeIcon,
  Icon,
  UnstyledButton,
} from "metabase/ui";

import S from "./DraftFormulaChip.module.css";

export type DraftFormulaChipHandle = {
  setFormula: (name: string, source: string) => void;
};

export type DraftFormulaChipProps = {
  handleRef: Ref<DraftFormulaChipHandle>;
  onFocus: () => void;
  onCancel: () => void;
};

export function DraftFormulaChip({
  handleRef,
  onFocus,
  onCancel,
}: DraftFormulaChipProps) {
  const [{ name, source }, setFormula] = useState({ name: "", source: "" });
  useImperativeHandle(
    handleRef,
    () => ({ setFormula: (name, source) => setFormula({ name, source }) }),
    [],
  );

  return (
    <Box className={S.root} data-testid="summary-well-draft-formula">
      <UnstyledButton
        className={S.button}
        aria-label={t`Edit the new formula in the formula bar`}
        onClick={onFocus}
      >
        <FixedSizeIcon name="function" size={12} />
        <Ellipsified
          fw="inherit"
          tooltip={source}
          alwaysShowTooltip={name.length > 0}
          tooltipProps={{ multiline: true, maw: 360 }}
        >
          {name || t`New formula`}
        </Ellipsified>
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
