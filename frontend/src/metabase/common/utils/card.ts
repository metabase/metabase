import querystring from "querystring";

import _ from "underscore";

import { clone } from "metabase/utils/clone";
import { b64hash_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import { stableStringify } from "metabase/utils/objects";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { deriveFieldOperatorFromParameter } from "metabase-lib/v1/parameters/utils/operators";
import { normalizeParameterValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  ActionParametersMapping,
  Card,
  CardId,
  DashboardParameterMapping,
  DatasetQuery,
  LegacyDatasetQuery,
  Parameter,
  ParameterValuesMap,
  UnsavedCard,
  VirtualDashCardParameterMapping,
} from "metabase-types/api";

export type SerializeCardOptions = {
  includeDatasetQuery?: boolean;
  includeOriginalCardId?: boolean;
  includeDisplayIsLocked?: boolean;
  creationType?: string;
  parameterValues?: ParameterValuesMap;
};

function getCleanCard(
  card: Card | UnsavedCard,
  {
    includeDatasetQuery = true,
    includeOriginalCardId = true,
    includeDisplayIsLocked = false,
    creationType,
    parameterValues,
  }: SerializeCardOptions = {},
) {
  const value = { ...card, creationType, parameterValues };
  const keysToInclude = [
    "collection_id",
    "dashboard_id",
    "dashboardId",
    "dashcardId",
    "description",
    "display",
    "name",
    "parameters",
    "type",
    "visualization_settings",
  ];

  if (includeDatasetQuery) {
    keysToInclude.push("dataset_query");
  }
  if (includeOriginalCardId) {
    keysToInclude.push("original_card_id");
  }
  if (includeDisplayIsLocked) {
    keysToInclude.push("displayIsLocked");
  }
  if (creationType) {
    keysToInclude.push("creationType");
  }
  if (parameterValues) {
    keysToInclude.push("parameterValues");
  }

  type Key = keyof typeof value;

  const res: { [key in Key]?: unknown } = {};
  for (const key of keysToInclude) {
    // coerce to undefined to omit
    res[key as Key] = value[key as Key] ?? undefined;
  }

  return res;
}

export function isEqualCard(card1?: Card | null, card2?: Card | null) {
  if (card1 && card2) {
    return _.isEqual(getCleanCard(card1), getCleanCard(card2));
  } else {
    return false;
  }
}

// TODO Atte Keinänen 5/31/17 Deprecated, we should move tests to Questions.spec.js
export function serializeCardForUrl(
  card: Card | UnsavedCard,
  options: SerializeCardOptions = {},
) {
  return utf8_to_b64url(stableStringify(getCleanCard(card, options)));
}

export function deserializeCardFromUrl(serialized: string): Card {
  return JSON.parse(b64hash_to_utf8(serialized));
}

export function deserializeCard(serializedCard: string) {
  const card = deserializeCardFromUrl(serializedCard);
  if (card.dataset_query.database != null) {
    card.dataset_query = normalize(card.dataset_query);
  }
  return card;
}

type HashOptions = {
  db?: string;
  table?: string;
  segment?: string;
};

export function parseHash(hash?: string) {
  let options: HashOptions = {};
  let serializedCard;

  // hash can contain either query params starting with ? or a base64 serialized card
  if (hash) {
    const cleanHash = hash.replace(/^#/, "");
    if (cleanHash.charAt(0) === "?") {
      options = querystring.parse(cleanHash.substring(1));
    } else {
      serializedCard = cleanHash;
    }
  }

  return { options, serializedCard };
}

export function isNative(card?: Card | null | undefined) {
  if (!card) {
    return false;
  }
  const question = Question.create({ dataset_query: card.dataset_query });
  return question.isNative();
}

function cardVisualizationIsEquivalent(cardA: Card, cardB: Card) {
  return _.isEqual(
    _.pick(cardA, "display", "visualization_settings"),
    _.pick(cardB, "display", "visualization_settings"),
  );
}

function isLegacyDatasetQuery(
  datasetQuery: DatasetQuery,
): datasetQuery is LegacyDatasetQuery {
  return (
    "type" in datasetQuery &&
    (datasetQuery.type === "query" || datasetQuery.type === "native")
  );
}

function datasetQueryForComparison(datasetQuery: DatasetQuery): DatasetQuery {
  const res = clone(datasetQuery);

  if (isLegacyDatasetQuery(res)) {
    res.parameters ??= [];
  }

  return res;
}

export function cardQueryIsEquivalent(cardA: Card, cardB: Card) {
  const datasetQueryA = datasetQueryForComparison(cardA.dataset_query);
  const datasetQueryB = datasetQueryForComparison(cardB.dataset_query);
  return Lib.areLegacyQueriesEqual(datasetQueryA, datasetQueryB);
}

export function cardParametersAreEquivalent(cardA: Card, cardB: Card) {
  return _.isEqual(cardA.parameters || [], cardB.parameters || []);
}

export function cardIsEquivalent(cardA: Card, cardB: Card) {
  return (
    cardQueryIsEquivalent(cardA, cardB) &&
    cardVisualizationIsEquivalent(cardA, cardB)
  );
}

// NOTE Atte Keinänen 7/5/17: Still used in dashboards and public questions.
// Query builder uses `Question.getResults` which contains similar logic.
export function applyParameters(
  card: Card,
  parameters: Parameter[] | null | undefined,
  parameterValues: ParameterValuesMap = {},
  parameterMappings:
    | ActionParametersMapping[]
    | DashboardParameterMapping[]
    | VirtualDashCardParameterMapping[] = [],
  { sparse = false }: { sparse?: boolean } = {},
) {
  // TODO(romeovs): This cast is a hack, this function only works with LegacyDatasetQuery
  const datasetQuery = clone(card.dataset_query) as LegacyDatasetQuery;
  datasetQuery.parameters = [];
  for (const parameter of parameters || []) {
    const value = parameterValues[parameter.id];

    const cardId = card.id || card.original_card_id;
    const mapping = _.findWhere(
      parameterMappings,
      cardId != null
        ? {
            card_id: cardId,
            parameter_id: parameter.id,
          }
        : // NOTE: this supports transient dashboards where cards don't have ids
          // BUT will not work correctly with multiseries dashcards since
          // there's no way to identify which card the mapping applies to.
          {
            parameter_id: parameter.id,
          },
    );

    const queryParameter: Partial<UiParameter> = {
      type: parameter.type,
      value: normalizeParameterValue(parameter.type, value),
      id: parameter.id,
    };

    const options =
      deriveFieldOperatorFromParameter(parameter)?.optionsDefaults;

    if (options) {
      queryParameter.options = options;
    }

    if (mapping) {
      // mapped target, e.x. on a dashboard
      queryParameter.target = mapping.target;
      datasetQuery.parameters.push(queryParameter as UiParameter);
    } else if (parameter.target) {
      // inline target, e.x. on a card
      queryParameter.target = parameter.target;
      datasetQuery.parameters.push(queryParameter as UiParameter);
    }

    if (sparse) {
      delete queryParameter.type;
      delete queryParameter.target;
    }
  }

  return datasetQuery;
}

export function isTransientCardId(id: CardId | string | null | undefined) {
  return id != null && typeof id === "string" && isNaN(parseInt(id));
}
