import "react-router/lib/Route";

declare module "react-router/lib/Route" {
  // Metabase-specific custom Route prop, read in Palette.tsx from `props.routes`
  // to suppress the command palette on certain routes (e.g. setup).
  interface RouteProps<Props> {
    disableCommandPalette?: boolean;
  }
}
