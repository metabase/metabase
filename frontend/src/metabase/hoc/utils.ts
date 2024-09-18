import { ComponentType } from "react";

export function getDisplayName<T>(WrappedComponent: ComponentType<T>): string {
  return WrappedComponent.displayName || WrappedComponent.name || "Component";
}
