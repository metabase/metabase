import { t } from "ttag";

const toSeconds = (minutes: number) => minutes * 60;

export type RefreshWidgetOption = {
  readonly name: string;
  readonly period: number | null;
};

export const AUTO_REFRESH_OPTIONS: RefreshWidgetOption[] = [
  {
    get name() {
      return t`Off`;
    },
    period: null,
  },
  {
    get name() {
      return t`1 minute`;
    },
    period: toSeconds(1),
  },
  {
    get name() {
      return t`5 minutes`;
    },
    period: toSeconds(5),
  },
  {
    get name() {
      return t`10 minutes`;
    },
    period: toSeconds(10),
  },
  {
    get name() {
      return t`15 minutes`;
    },
    period: toSeconds(15),
  },
  {
    get name() {
      return t`30 minutes`;
    },
    period: toSeconds(30),
  },
  {
    get name() {
      return t`60 minutes`;
    },
    period: toSeconds(60),
  },
];
