// Keep the EE Python routes' chunk name separate from the core routes, so the
// bundler does not merge their distinct module sets into the core routes' chunk.
export const loadNewPythonTransformPage = () =>
  import(
    /* webpackChunkName: "transforms-python" */ "./pages/NewTransformPage"
  ).then(({ NewPythonTransformPage }) => ({
    Component: NewPythonTransformPage,
  }));

export const loadTransformListPage = () =>
  import(
    /* webpackChunkName: "transforms-python" */ "./pages/TransformListPage"
  ).then(({ TransformListPage }) => ({ Component: TransformListPage }));
