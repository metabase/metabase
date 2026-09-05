import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  type CalendarId,
  DEFAULT_CALENDAR,
  setDisplayCalendar,
} from "metabase/utils/calendar";

const CalendarContext = createContext<CalendarId>(DEFAULT_CALENDAR);

export function useDisplayCalendar() {
  return useContext(CalendarContext);
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { value, isLoading } = useUserKeyValue({
    namespace: "calendar",
    key: "display_calendar",
    defaultValue: DEFAULT_CALENDAR,
  });
  const [appliedCalendar, setAppliedCalendar] = useState(DEFAULT_CALENDAR);

  useEffect(() => {
    setDisplayCalendar(value);
    setAppliedCalendar(value);
    return () => setDisplayCalendar(DEFAULT_CALENDAR);
  }, [value]);

  // Avoid rendering dates once with the wrong calendar while the preference
  // is loading or being applied to the non-React formatting boundary.
  if (isLoading || appliedCalendar !== value) {
    return null;
  }

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}
