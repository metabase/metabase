interface Window {
  MetabaseBootstrap: any;
}

// This allows importing static SVGs from TypeScript files
declare module "*.svg" {
  const content: any;
  export default content;
}
