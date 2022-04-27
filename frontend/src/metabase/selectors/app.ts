import { State } from "metabase-types/store";

export const getErrorPage = (state: State) => state.app.errorPage;

export const getErrorMessage = (state: State) => {
  const errorPage = getErrorPage(state);
  return errorPage?.data?.message || errorPage?.data;
};
