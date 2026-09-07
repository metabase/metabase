import { createBoundaryPlugin } from "../../oxlint-boundaries.mjs";
import { wrap } from "../plugin.mjs";
import { resolver } from "../resolver.mjs";
export default wrap(
  "boundaries",
  createBoundaryPlugin({ resolve: resolver.resolveImport }),
);
