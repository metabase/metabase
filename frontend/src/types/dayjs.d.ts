import type { ManipulateType } from "dayjs";

type SupportedUnit = QUnitType | "isoWeek" | ManipulateType;

declare module "dayjs" {
  interface Dayjs {
    add(value: number, unit: SupportedUnit): Dayjs;

    subtract(value: number, unit: SupportedUnit): Dayjs;

    startOf(unit: SupportedUnit): Dayjs;

    endOf(unit: SupportedUnit): Dayjs;

    isSame(date?: ConfigType, unit?: SupportedUnit): boolean;

    isBefore(date?: ConfigType, unit?: SupportedUnit): boolean;

    isAfter(date?: ConfigType, unit?: SupportedUnit): boolean;
  }

  export function parseZone(
    date?: ConfigType,
    format?: string,
    locale?: string,
    strict?: boolean,
  ): Dayjs;
}
