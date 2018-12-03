import { IFRAMED_IN_SELF } from "./dom";

// detect if this page is embedded in itself, i.e. it's a embed preview
// will need to do something different if we ever embed metabase in itself for another reason
export const IS_EMBED_PREVIEW = IFRAMED_IN_SELF;
