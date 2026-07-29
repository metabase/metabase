interface Window {
  MetabaseBootstrap: any;
  MetabaseRoot?: string;
  MetabaseNonce?: string;
  MetabaseUserColorScheme?: string;
  overrideIsWithinIframe?: boolean; // Mock that we're embedding, so we could test embed components
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
