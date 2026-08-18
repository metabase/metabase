import type { DatesProviderSettings } from "@mantine/dates";
import { DatesProvider as MantineDatesProvider } from "@mantine/dates";
import type { ReactNode } from "react";

import { dayjs } from "metabase/dayjs";

interface DatesProviderProps {
  children?: ReactNode;
}

export function DatesProvider({ children }: DatesProviderProps) {
  const settings: DatesProviderSettings = {
    locale: dayjs().locale(),
    firstDayOfWeek: dayjs().startOf("week").day(),
  };

  return (
    <MantineDatesProvider settings={settings}>{children}</MantineDatesProvider>
  );
}
