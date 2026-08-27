declare module "ee-overrides" {
  const enterpriseOverrides: (() => void) | undefined;
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default enterpriseOverrides;
}
