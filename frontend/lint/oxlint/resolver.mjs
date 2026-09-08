import { ResolverFactory } from "oxc-resolver";

import { createImportResolverService } from "../oxlint-import-resolver.mjs";

export const resolver = createImportResolverService({ ResolverFactory });
