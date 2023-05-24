interface Window {
  MetabaseBootstrap: any;
  ace: any;
}

// This allows importing static SVGs from TypeScript files
declare module "*.svg" {
  const content: any;
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default content;
}
