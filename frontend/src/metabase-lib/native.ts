import * as ML from "cljs/metabase.lib.js";
import { TemplateTags } from "metabase-types/types/Query";

export function templateTags(
  queryText: string,
  existingTags?: TemplateTags,
): TemplateTags {
  return existingTags
    ? ML.template_tags(queryText, existingTags)
    : ML.template_tags(queryText);
}
