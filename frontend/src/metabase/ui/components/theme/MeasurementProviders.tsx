import type { ReactNode } from "react";

import { EmotionCacheProvider } from "./EmotionCacheProvider";
import { ThemeProvider } from "./ThemeProvider";

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
