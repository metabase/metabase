/**
 * For some reason if define just `externals` it still behaves wrong,
 * so we do inversion: define `noExternals` that matches everything except `externals`
 */
export const getExternalsConfig = ({ externals }) => {
  const noExternalsRegExp = new RegExp(
    `^(?!(?:${externals.map((external) => `${external}(?:\\/|$)`).join("|")})).*`,
  );

  return {
    externals: undefined,
    noExternal: [
      noExternalsRegExp,
      // Preserve all 3rd party CSS imports to bundle them
      // It's important because some frameworks like Next throw an error if a 3rd party JS file imports CSS
      /.*\.css$/,
    ],
  };
};
