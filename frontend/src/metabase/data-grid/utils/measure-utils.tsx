import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { unmountRoot } from "metabase/lib/react-compat";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";

import { DEFAULT_FONT_SIZE } from "../constants";

interface MeasurementContainerOptions {
  fontSize?: string;
}

export function createMeasurementContainer(
  options: MeasurementContainerOptions = {},
): HTMLDivElement {
  const { fontSize = DEFAULT_FONT_SIZE } = options;

  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-999";
  container.style.fontSize = fontSize;
  container.style.lineHeight = "1";
  document.body.appendChild(container);

  return container;
}

export function removeMeasurementContainer(
  container: HTMLDivElement,
  tree: Root | undefined,
): void {
  setTimeout(() => {
    unmountRoot(tree, container);
    document.body.removeChild(container);
  }, 0);
}

interface MeasurementProvidersProps {
  children: ReactNode;
}

export function MeasurementProviders({ children }: MeasurementProvidersProps) {
  return (
    <EmotionCacheProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </EmotionCacheProvider>
  );
}
