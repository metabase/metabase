// Built-in GeoJSON maps imported via the `assets` alias (-> resources/frontend_client/app/assets).
// rspack/Storybook resolve the file at build time; this ambient declaration lets tsc type the import.
// (tsconfig `paths` has no `assets` entry, so without this the specifier wouldn't resolve.)
declare module "assets/geojson/*.json" {
  import type { FeatureCollection } from "geojson";

  const data: FeatureCollection;

  // eslint-disable-next-line import/no-default-export
  export default data;
}
