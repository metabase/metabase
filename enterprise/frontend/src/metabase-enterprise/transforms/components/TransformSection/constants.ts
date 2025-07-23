import { t } from "ttag";

export const SCHEDULE_OPTIONS = [
  {
    value: "0 0 0/1 * * ? *",
    get label() {
      return t`Every hour`;
    },
  },
  {
    value: "0 0 0/2 * * ? *",
    get label() {
      return t`Every 2 hours`;
    },
  },
  {
    value: "0 0 0/3 * * ? *",
    get label() {
      return t`Every 3 hours`;
    },
  },
  {
    value: "0 0 0/6 * * ? *",
    get label() {
      return t`Every 6 hours`;
    },
  },
  {
    value: "0 0 0/12 * * ? *",
    get label() {
      return t`Every 12 hours`;
    },
  },
  {
    value: "0 0 0 ? * * *",
    get label() {
      return t`Every 24 hours`;
    },
  },
];
