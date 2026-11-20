import { t } from "ttag";

import { Tooltip, UnstyledButton } from "metabase/ui";

import S from "./InlineExpressionEditorE.module.css";
import FunctionIcon from "./function.svg?component";
import SparkleIcon from "./sparkle.svg?component";

type Mode = "ai" | "code";

type ModeSwitchProps = {
  mode: Mode;
  disabled?: boolean;
  onChange: (mode: Mode) => void;
};

/**
 * Version E: the switch between the AI prompt and the code, at the start of
 * the input. A segmented control with two icons.
 */
export function ModeSwitch({ mode, disabled, onChange }: ModeSwitchProps) {
  const options = [
    { value: "ai" as const, label: t`Ask AI`, icon: <SparkleIcon /> },
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
