import { ResolverFactory } from "oxc-resolver";

import { createImportResolverService } from "../oxlint-import-resolver.mjs";

// One service per fresh CLI process; not an editor/watch-mode integration.
export const resolver = createImportResolverService({ ResolverFactory });
