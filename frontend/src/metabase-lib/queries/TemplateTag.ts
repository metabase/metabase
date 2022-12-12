import Utils from "metabase/lib/utils";
import { humanize } from "metabase/lib/formatting";
import { TemplateTag } from "metabase-types/types/Query";

export const createTemplateTag = (tagName: string): TemplateTag => {
  return {
    id: Utils.uuid(),
    name: tagName,
    "display-name": humanize(tagName),
    type: "text",
  };
};
