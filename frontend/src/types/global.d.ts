interface Window {
  MetabaseBootstrap: any;
  MetabaseRoot?: string;
  MetabaseNonce?: string;
  MetabaseUserColorScheme?: string;
}

// This allows importing static SVGs from TypeScript files
declare module "*.svg" {
  const content: any;
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default content;
}

// This allows importing CSS from TypeScript files
declare module "*.css" {
  const classes: { [key: string]: string };
  // eslint-disable-next-line import/no-default-export -- deprecated usage
  export default classes;
}

type Nullable<T> = T | null;
