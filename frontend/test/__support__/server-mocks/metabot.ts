import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  MetabotApiEntity,
  MetabotId,
  MetabotInfo,
  SuggestedMetabotPrompt,
  SuggestedMetabotPromptsResponse,
} from "metabase-types/api";

export function setupMetabotsEndpoint(
  metabots: MetabotInfo[],
  statusCode?: number,
) {
  fetchMock.get(
    "path:/api/ee/metabot-v3/metabot",
    statusCode ? { status: statusCode } : { items: metabots },
  );
}

export function setupMetabotEntitiesEndpoint(
  metabotId: MetabotId,
  entities: MetabotApiEntity[],
) {
  fetchMock.get(`path:/api/ee/metabot-v3/metabot/${metabotId}/entities`, {
    items: entities,
  });
}

export function setupMetabotAddEntitiesEndpoint(metabotId: MetabotId) {
  fetchMock.put(`path:/api/ee/metabot-v3/metabot/${metabotId}/entities`, {
    status: 204,
  });
}

export function setupMetabotDeleteEntitiesEndpoint() {
  fetchMock.delete(/api\/ee\/metabot-v3\/metabot\/\d+\/entities/, {
    status: 204,
  });
}

export function setupMetabotPromptSuggestionsEndpointError(
  metabotId: MetabotId,
) {
  fetchMock.get(
    `path:/api/ee/metabot-v3/metabot/${metabotId}/prompt-suggestions`,
    { status: 500 },
  );
}

export function setupMetabotPromptSuggestionsEndpoint(
  metabotId: MetabotId,
  prompts: SuggestedMetabotPromptsResponse["prompts"],
  paginationContext: {
    offset: number;
    limit: number;
    total: number;
  },
  options?: UserRouteConfig,
) {
  const { total, limit, offset } = paginationContext;

  const page = prompts.slice(offset, offset + limit);
  const body = { prompts: page, limit, offset, total };
  fetchMock.get({
    url: `path:/api/ee/metabot-v3/metabot/${metabotId}/prompt-suggestions`,
    query: { limit, offset },
    response: {
      status: 200,
      body,
    },
    ...options,
  });

  return {
    ...paginationContext,
    offset: limit + offset,
  };
}

export function setupRemoveMetabotPromptSuggestionEndpoint(
  metabotId: MetabotId,
  promptId: SuggestedMetabotPrompt["id"],
) {
  fetchMock.delete(
    `path:/api/ee/metabot-v3/metabot/${metabotId}/prompt-suggestions/${promptId}`,
    { status: 202 },
  );
}

export function setupRegenerateMetabotPromptSuggestionsEndpoint(
  metabotId: MetabotId,
  options?: UserRouteConfig,
) {
  fetchMock.post(
    `path:/api/ee/metabot-v3/metabot/${metabotId}/prompt-suggestions/regenerate`,
    { status: 204 },
    options,
  );
}
