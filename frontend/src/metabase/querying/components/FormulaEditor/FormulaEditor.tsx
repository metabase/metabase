import cx from "classnames";
import { t } from "ttag";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { ActionIcon, Box, Ellipsified, Flex, Icon, Tooltip } from "metabase/ui";

import S from "./FormulaEditor.module.css";
import type { FormulaEditorProps } from "./types";
import { useFormulaEditor } from "./use-formula-editor";

// CodeMirror reconfigures when the basicSetup or onChange identity changes.
const BASIC_SETUP = {
  lineNumbers: false,
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
};

export function FormulaEditor(props: FormulaEditorProps) {
  const { expressionMode, submitLabel, onCancel } = props;
  const {
    source,
    hasFormula,
    errorMessage,
    extensions,
    completionTooltipPortal,
    handleChange,
    handleCreate,
    handleSubmit,
  } = useFormulaEditor(props);

  return (
    <Box
      className={cx(S.formulaBar, {
        [S.formulaBarInvalid]: errorMessage,
      })}
      data-testid="formula-editor"
    >
      <Icon name="function" className={S.formulaBarFx} aria-hidden />
      <CodeMirror
        className={S.formulaEditor}
        basicSetup={BASIC_SETUP}
        extensions={extensions}
        value={source}
        placeholder={
          expressionMode === "aggregation"
            ? t`Sum([Total]) / Count()`
            : t`concat([Category], " - ", [Vendor])`
        }
        autoCorrect="off"
        tabMovesFocus
        onCreateEditor={handleCreate}
        onChange={handleChange}
      />
      {completionTooltipPortal}
      {errorMessage && (
        <Flex
          className={S.formulaBarError}
          data-testid="formula-error"
          role="alert"
        >
          <Icon name="warning" size={14} aria-hidden />
          <Ellipsified
            className={S.formulaBarErrorText}
            tooltipProps={{ multiline: true, maw: 360 }}
          >
            {errorMessage}
          </Ellipsified>
        </Flex>
      )}
      <Flex className={S.formulaBarActions}>
        <Tooltip label={t`Cancel (Esc)`}>
          <ActionIcon
            className={S.formulaBarAction}
            variant="subtle"
            aria-label={t`Cancel formula`}
            onClick={onCancel}
          >
            <Icon name="close" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`${submitLabel} (Enter)`}>
          <ActionIcon
            className={S.formulaBarAction}
            variant="subtle"
            color="positive"
            aria-label={submitLabel}
            disabled={!hasFormula}
            onClick={handleSubmit}
          >
            <Icon name="check" />
          </ActionIcon>
        </Tooltip>
      </Flex>
    </Box>
  );
}
