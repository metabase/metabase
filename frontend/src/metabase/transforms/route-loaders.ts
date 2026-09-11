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
