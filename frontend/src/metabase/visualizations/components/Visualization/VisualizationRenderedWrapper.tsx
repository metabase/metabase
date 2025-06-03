import { type ReactNode, useEffect } from "react";

type VisualizationRenderedWrapperProps = {
  children: ReactNode;
  onRendered?: () => void;
};

export function VisualizationRenderedWrapper({
  children,
  onRendered,
}: VisualizationRenderedWrapperProps) {
  useEffect(() => {
    onRendered?.();
  });

  return <>{children}</>;
}
