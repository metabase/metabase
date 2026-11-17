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
  setName: (name: string) => void;
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
  const [name, setName] = useState("");
  useImperativeHandle(handleRef, () => ({ setName }), []);

  return (
    <Box className={S.root} data-testid="summary-well-draft-formula">
      <UnstyledButton
        className={S.button}
        aria-label={t`Edit the new formula in the formula bar`}
        onClick={onFocus}
      >
        <FixedSizeIcon name="function" size={12} />
        <Ellipsified fw="inherit">{name || t`New formula`}</Ellipsified>
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
