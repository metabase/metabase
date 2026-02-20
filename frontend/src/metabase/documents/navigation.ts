export const navigateToPath = (path: string) => {
  if (window.location.pathname + window.location.search === path) {
    return;
  }

  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
