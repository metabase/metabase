export const getHelpUrl = (
  premium: boolean,
  versionTag: string = "latest",
  diag?: string,
) => {
  let helpUrl = premium
    ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${versionTag}`
    : `https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=${versionTag}`;

  if (diag) {
    helpUrl += `&diag=${diag}`;
  }

  return helpUrl;
};
