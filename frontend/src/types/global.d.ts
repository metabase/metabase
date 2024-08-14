interface Window {
  MetabaseBootstrap: any;
  MetabaseRoot?: string;
  MetabaseNonce?: string;
}

// This allows importing static SVGs from TypeScript files
declare module "*.svg" {
  const content: any;
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default content;
}

// This allows importing CSS from TypeScript files
declare module "*.css" {
  const content: any;
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default content;
}

type Nullable<T> = T | null;
