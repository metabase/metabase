import type { ReactNode } from "react";
import dayjs from "dayjs";
import { DatesProvider as MantineDatesProvider } from "@mantine/dates";
import type { DatesProviderSettings, DayOfWeek } from "@mantine/dates";

interface DatesProviderProps {
  children?: ReactNode;
}

export function DatesProvider({ children }: DatesProviderProps) {
  const settings: DatesProviderSettings = {
    locale: dayjs.locale(),
    firstDayOfWeek: dayjs.localeData().firstDayOfWeek() as DayOfWeek,
  };

  return (
    <MantineDatesProvider settings={settings}>{children}</MantineDatesProvider>
  );
}
