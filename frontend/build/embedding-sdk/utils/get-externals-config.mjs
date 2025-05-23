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
    noExternal: [noExternalsRegExp],
  };
};
