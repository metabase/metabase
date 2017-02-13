/* @flow */

import type { TemplateTag } from "./types/Query";
import type { Parameter } from "./types/Dashboard";

export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
    return tags.filter(tag => tag.type != null && tag.type !== "dimension")
        .map(tag => ({
            id: tag.id,
            type: tag.type === "date" ? "date/single" : "category",
            target: ["variable", ["template-tag", tag.name]],
            name: tag.display_name,
            slug: tag.name,
            default: tag.default
        }))
}
