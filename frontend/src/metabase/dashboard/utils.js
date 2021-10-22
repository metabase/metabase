import _ from "underscore";

import Utils from "metabase/lib/utils";

export function syncParametersAndEmbeddingParams(before, after) {
  if (after.parameters && before.embedding_params) {
    return Object.keys(before.embedding_params).reduce((memo, embedSlug) => {
      const slugParam = _.find(before.parameters, param => {
        return param.slug === embedSlug;
      });
      if (slugParam) {
        const slugParamId = slugParam && slugParam.id;
        const newParam = _.findWhere(after.parameters, { id: slugParamId });
        if (newParam) {
          memo[newParam.slug] = before.embedding_params[embedSlug];
        }
      }
      return memo;
    }, {});
  } else {
    return before.embedding_params;
  }
}

// This adds default properties and placeholder IDs for an inline dashboard
export function expandInlineDashboard(dashboard) {
  return {
    name: "",
    parameters: [],
    ...dashboard,
    ordered_cards: dashboard.ordered_cards.map(dashcard => ({
      visualization_settings: {},
      parameter_mappings: [],
      ...dashcard,
      id: _.uniqueId("dashcard"),
      card: expandInlineCard(dashcard.card),
      series: (dashcard.series || []).map(card => expandInlineCard(card)),
    })),
  };
}

export function expandInlineCard(card) {
  return {
    name: "",
    visualization_settings: {},
    ...card,
    id: _.uniqueId("card"),
  };
}

export function isVirtualDashCard(dashcard) {
  return _.isObject(dashcard.visualization_settings.virtual_card);
}

export function getAllDashboardCards(dashboard) {
  const results = [];
  if (dashboard) {
    for (const dashcard of dashboard.ordered_cards) {
      const cards = [dashcard.card].concat(dashcard.series || []);
      results.push(...cards.map(card => ({ card, dashcard })));
    }
  }
  return results;
}

export function getDashboardType(id) {
  if (id == null || typeof id === "object") {
    // HACK: support inline dashboards
    return "inline";
  } else if (Utils.isUUID(id)) {
    return "public";
  } else if (Utils.isJWT(id)) {
    return "embed";
  } else if (/\/auto\/dashboard/.test(id)) {
    return "transient";
  } else {
    return "normal";
  }
}

export async function fetchDataOrError(dataPromise) {
  try {
    return await dataPromise;
  } catch (error) {
    return { error };
  }
}
