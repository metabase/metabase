import { t } from "ttag";

import { Tooltip, UnstyledButton } from "metabase/ui";

import S from "./InlineExpressionEditorF.module.css";
import FunctionIcon from "./function.svg?component";
import SparkleFilledIcon from "./sparkle-filled.svg?component";
import SparkleIcon from "./sparkle.svg?component";

type Mode = "ai" | "code";

type ModeSwitchProps = {
  mode: Mode;
  disabled?: boolean;
  onChange: (mode: Mode) => void;
};

/**
 * Version F: the switch between the AI prompt and the code, a strip on the
 * left edge of the input. The current mode is a white cell.
 */
export function ModeSwitch({ mode, disabled, onChange }: ModeSwitchProps) {
  const options = [
    {
      value: "ai" as const,
      label: t`Ask AI`,
      icon: mode === "ai" ? <SparkleFilledIcon /> : <SparkleIcon />,
    },
    {
      value: "code" as const,
      label: t`Write an expression`,
      icon: <FunctionIcon />,
    },
  ];
  return (
    <div className={S.modeSwitch} role="radiogroup" aria-label={t`Mode`}>
      {options.map((option) => (
        <Tooltip key={option.value} label={option.label}>
          <UnstyledButton
            className={S.modeOption}
            role="radio"
            aria-label={option.label}
            aria-checked={mode === option.value}
            disabled={disabled}
            onClick={() => mode !== option.value && onChange(option.value)}
          >
            {option.icon}
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}
