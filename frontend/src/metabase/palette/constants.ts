import { t } from "ttag";

export const GROUP_LABLES = {
  get global() {
    return t`General`;
  },
  get dashboard() {
    return t`Dashboard`;
  },
  get question() {
    return t`Querying & the notebook`;
  },
  get collection() {
    return t`Collection`;
  },
  get admin() {
    return t`Admin`;
  },
};

export const ELLIPSIS = "...";
