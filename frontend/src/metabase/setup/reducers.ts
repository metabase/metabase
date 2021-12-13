import { handleActions } from "redux-actions";
import { SET_LOCALE } from "./actions";

export const locale = handleActions(
  {
    [SET_LOCALE]: { next: (state, { payload }) => payload },
  },
  null,
);

export default {
  locale,
};
