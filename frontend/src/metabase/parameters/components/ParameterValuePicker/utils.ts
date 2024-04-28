import type { KeyboardEvent } from "react";

export function blurOnCommitKey(event: KeyboardEvent<HTMLElement>) {
  switch (event.key) {
    case "Enter":
    case "Escape":
      (event.target as HTMLElement).blur();
  }
}
