interface Window {
  MetabaseBootstrap: any;
  MetabaseRoot?: string;
  MetabaseNonce?: string;
  MetabaseUserColorScheme?: string;

  overrideIsWithinIframe?: boolean; // Mock that we're embedding, so we could test embed components
  METABASE?: boolean; // Add a global so we can check if the parent iframe is Metabase

  // Make iFrameResizer available so that embed users can
  // have their embeds autosize to their content
  iFrameResizer?: {
    autoResize?: boolean;
    heightCalculationMethod?: string;
    onReady?: () => void;
  };
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
