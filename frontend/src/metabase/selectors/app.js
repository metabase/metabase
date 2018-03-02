export const getErrorMessage = state =>
  state.app.errorPage &&
  state.app.errorPage.data &&
  (state.app.errorPage.data.message || state.app.errorPage.data);
