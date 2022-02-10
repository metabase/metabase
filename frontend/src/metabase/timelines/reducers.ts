import { handleActions } from "redux-actions";
import { CREATE_TIMELINE } from "./actions";

export const mode = handleActions(
  {
    [CREATE_TIMELINE]: { next: (state, { payload }) => payload },
  },
  "timeline-list",
);

export default {
  mode,
};
