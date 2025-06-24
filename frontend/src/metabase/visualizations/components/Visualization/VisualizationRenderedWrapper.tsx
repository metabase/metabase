import { useEffect } from "react";

type VisualizationRenderedWrapperProps = {
  children: React.ReactNode;
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
