import type { KeyboardEvent } from "react";

export function handleInputKeyup(event: KeyboardEvent<HTMLInputElement>) {
  const target = event.target as HTMLInputElement;
  switch (event.key) {
    // Values are "committed" immediately because it's controlled from the outside
    case "Enter":
    case "Escape":
      target.blur();
  }
}
