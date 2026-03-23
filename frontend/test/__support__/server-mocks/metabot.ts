import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  MetabotId,
  MetabotInfo,
  MetabotSettingsResponse,
  SuggestedMetabotPrompt,
  SuggestedMetabotPromptsResponse,
  UpdateMetabotSettingsRequest,
} from "metabase-types/api";

export function setupMetabotsEndpoints(
  metabots: MetabotInfo[],
  statusCode?: number,
) {
  fetchMock.get(
    "path:/api/metabot/metabot",
    statusCode ? { status: statusCode } : { items: metabots },
  );
  metabots.forEach((metabot) => {
    fetchMock.put(`path:/api/metabot/metabot/${metabot.id}`, (call) => {
      return { ...metabot, ...JSON.parse(call.options?.body as string) };
    });
  });
}

export function setupMetabotPromptSuggestionsEndpointError(
  metabotId: MetabotId,
) {
  fetchMock.get(`path:/api/metabot/metabot/${metabotId}/prompt-suggestions`, {
    status: 500,
  });
}

export function setupMetabotAddEntitiesEndpoint(metabotId: MetabotId) {
  fetchMock.put(`path:/api/metabot/metabot/${metabotId}/entities`, {
    status: 204,
  });
}

type SuggestionsEndpointOptions = {
  metabotId: MetabotId;
  prompts: SuggestedMetabotPromptsResponse["prompts"];
  paginationContext: {
    offset: number;
    limit: number;
    total: number;
  };
  delay?: UserRouteConfig["delay"];
};

export function setupMetabotPromptSuggestionsEndpoint({
  metabotId,
  prompts,
  paginationContext,
  delay,
}: SuggestionsEndpointOptions) {
  const { total, limit, offset } = paginationContext;

  const page = prompts.slice(offset, offset + limit);
  const body = { prompts: page, limit, offset, total };
  fetchMock.removeRoute(`metabot-${metabotId}-prompt-suggestions-get`);
  fetchMock.get({
    url: `path:/api/metabot/metabot/${metabotId}/prompt-suggestions`,
    query: { limit, offset },
    response: {
      status: 200,
      body,
    },
    name: `metabot-${metabotId}-prompt-suggestions-get`,
    delay,
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
    `path:/api/metabot/metabot/${metabotId}/prompt-suggestions/${promptId}`,
    { status: 202 },
  );
}

export function setupRegenerateMetabotPromptSuggestionsEndpoint(
  metabotId: MetabotId,
  options?: UserRouteConfig,
) {
  fetchMock.post(
    `path:/api/metabot/metabot/${metabotId}/prompt-suggestions/regenerate`,
    { status: 204 },
    options,
  );
}

const SLACK_SETTINGS_ROUTE_NAME = "metabot-slack-settings";

export function setupMetabotSlackSettingsEndpoint() {
  fetchMock.removeRoute(SLACK_SETTINGS_ROUTE_NAME);
  fetchMock.put(
    "path:/api/metabot/slack/settings",
    { ok: true },
    {
      name: SLACK_SETTINGS_ROUTE_NAME,
    },
  );
}

export function setupMetabotSlackSettingsEndpointWithError(
  status: number,
  body: string,
) {
  fetchMock.removeRoute(SLACK_SETTINGS_ROUTE_NAME);
  fetchMock.put(
    "path:/api/metabot/slack/settings",
    { status, body },
    {
      name: SLACK_SETTINGS_ROUTE_NAME,
    },
  );
}

export function setupMetabotSettingsEndpoint({
  provider,
  response,
}: {
  provider: UpdateMetabotSettingsRequest["provider"];
  response: MetabotSettingsResponse;
}) {
  fetchMock.get(`path:/api/metabot/settings?provider=${provider}`, response);
}

export function setupUpdateMetabotSettingsEndpoint(
  response: MetabotSettingsResponse,
) {
  fetchMock.put("path:/api/metabot/settings", response);
}

export function setupUpdateMetabotSettingsEndpointWithError(
  status: number,
  body: string,
) {
  fetchMock.put("path:/api/metabot/settings", { status, body });
}
