import type { ComponentType } from "react";

export function getDisplayName(
  WrappedComponent: ComponentType,
): string {
  return WrappedComponent.displayName || WrappedComponent.name || "Component";
}
