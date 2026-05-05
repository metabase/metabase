import { useContext } from "react";

import { HistoryContext } from "./HistoryProvider";

export const useHistory = () => {
  const history = useContext(HistoryContext);
  if (!history) {
    throw new Error("useHistory must be used inside <HistoryProvider>");
  }
  return history;
};
