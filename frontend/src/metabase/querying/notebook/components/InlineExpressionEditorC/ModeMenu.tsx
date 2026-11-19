import cx from "classnames";
import { t } from "ttag";

import { Icon, Menu, UnstyledButton } from "metabase/ui";

import S from "./InlineExpressionEditorC.module.css";
import EqualIcon from "./equal.svg?component";

/** Code that the AI converts to a custom expression. */
export type ConvertFrom = "sql" | "python" | "excel";

/** What the editor takes: a prompt, code, or code to convert. */
export type EditorModeC = "ai" | "code" | ConvertFrom;

export const CONVERT_FROM_NAMES: Record<ConvertFrom, string> = {
  sql: "SQL",
  python: "Python",
  excel: "Excel",
};

type ModeMenuProps = {
  mode: EditorModeC;
  onChange: (mode: EditorModeC) => void;
};

/**
 * Version C: the round button at the start of the input, "+" for the AI and
 * "=" for code. Its menu switches the mode, or primes the AI to convert code.
 */
export function ModeMenu({ mode, onChange }: ModeMenuProps) {
  const isCode = mode === "code";

  const item = (value: EditorModeC, label: string) => (
    <Menu.Item
      className={cx(S.menuItem, { [S.isSelected]: mode === value })}
      onClick={() => onChange(value)}
    >
      {label}
    </Menu.Item>
  );

  return (
    <Menu position="bottom-start" width={256}>
      <Menu.Target>
        <UnstyledButton
          className={S.modeButton}
          aria-label={isCode ? t`Custom expression` : t`Ask AI`}
        >
          {isCode ? <EqualIcon aria-hidden /> : <Icon name="add" />}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown className={S.menu}>
        {item("ai", t`Ask AI`)}
        {item("code", t`Custom expression`)}
        <Menu.Divider />
        <Menu.Label>{t`Convert`}</Menu.Label>
        {item("sql", CONVERT_FROM_NAMES.sql)}
        {item("python", CONVERT_FROM_NAMES.python)}
        {item("excel", CONVERT_FROM_NAMES.excel)}
      </Menu.Dropdown>
    </Menu>
  );
}
