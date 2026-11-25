import { t } from "ttag";

import { Box, Combobox, Icon, Kbd } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryWellId } from "../types";

export const CUSTOM_FORMULA_OPTION_VALUE = "custom-formula";

type CustomFormulaOptionProps = {
  wellId: SummaryWellId;
};

export function CustomFormulaOption({ wellId }: CustomFormulaOptionProps) {
  return (
    <Combobox.Group label={t`Formula`}>
      <Combobox.Option value={CUSTOM_FORMULA_OPTION_VALUE}>
        <Icon name="function" className={S.searchOptionIcon} aria-hidden />
        <Box className={S.searchOptionText}>
          {wellId === "values" ? t`Custom aggregation` : t`Custom column`}
        </Box>
        <Kbd>{"="}</Kbd>
      </Combobox.Option>
    </Combobox.Group>
  );
}
