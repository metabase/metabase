import { useEffect } from "react";

import { Button, type ButtonProps, Group, Kbd } from "metabase/ui";

export type VerdictOption<Verdict extends string> = {
  value: Verdict;
  label: string;
  /** Keyboard shortcut (compared case-insensitively against `event.key`). */
  hotkey: string;
  variant?: ButtonProps["variant"];
};

type VerdictButtonsProps<Verdict extends string> = {
  options: readonly VerdictOption<Verdict>[];
  disabled: boolean;
  onSelect: (verdict: Verdict) => void;
  size?: ButtonProps["size"];
};

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** A row of verdict buttons, each also triggered by its hotkey outside inputs. */
export function VerdictButtons<Verdict extends string>({
  options,
  disabled,
  onSelect,
  size,
}: VerdictButtonsProps<Verdict>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        disabled ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const option = options.find((option) => option.hotkey === key);
      if (option) {
        event.preventDefault();
        onSelect(option.value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, options, onSelect]);

  return (
    <Group gap="xs" wrap="wrap">
      {options.map((option) => (
        <Button
          key={option.value}
          size={size}
          disabled={disabled}
          variant={option.variant ?? "filled"}
          onClick={() => onSelect(option.value)}
          rightSection={<Kbd size="xs">{option.hotkey.toUpperCase()}</Kbd>}
        >
          {option.label}
        </Button>
      ))}
    </Group>
  );
}
