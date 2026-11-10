import fetchMock from "fetch-mock";

import type { ActionTemplateCategory } from "metabase-types/api";

export function setupActionTemplateCategoriesEndpoint(
  categories: ActionTemplateCategory[],
) {
  fetchMock.get("path:/api/action-template", categories);
}
