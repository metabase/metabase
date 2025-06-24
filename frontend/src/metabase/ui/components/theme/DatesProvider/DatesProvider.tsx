import type { DatesProviderSettings, DayOfWeek } from "@mantine/dates";
import { DatesProvider as MantineDatesProvider } from "@mantine/dates";
import dayjs from "dayjs";

interface DatesProviderProps {
  children?: React.ReactNode;
}

export function DatesProvider({ children }: DatesProviderProps) {
  const settings: DatesProviderSettings = {
    locale: dayjs().locale(),
    firstDayOfWeek: dayjs().startOf("week").day() as DayOfWeek,
  };

  return (
    <MantineDatesProvider settings={settings}>{children}</MantineDatesProvider>
  );
}
