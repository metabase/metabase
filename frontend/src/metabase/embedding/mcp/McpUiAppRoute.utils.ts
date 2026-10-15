import type { SqlParameterValues } from "embedding-sdk-bundle/types/question";
import { b64_to_utf8 } from "metabase/utils/encoding";
import type { SeriesCard, VisualizationSettings } from "metabase-types/api";

export const MCP_APP_VISUALIZATION_SETTINGS: VisualizationSettings = {
  "graph.x_axis.labels_enabled": false,
  "graph.y_axis.labels_enabled": false,
};

export interface McpDeserializedQuery {
  card: SeriesCard;
  initialSqlParameters: SqlParameterValues;
}

/**
 * Split a base64 MCP query handle into the card to render and the template-tag
 * values to run it with. Returns null when the payload is not decodable JSON.
 */
export function getMcpDeserializedQuery(
  query: string,
): McpDeserializedQuery | null {
  try {
    // `execute_sql` mints a payload wider than a dataset query: the values bound to `{{tag}}`
    // placeholders ride alongside it under `parameters`, because the backend's
    // `prepare-for-serialization` strips `:parameters` from the query itself as runtime-only.
    const { parameters, ...datasetQuery } = JSON.parse(b64_to_utf8(query));

    return {
      card: {
        display: "table",
        dataset_query: datasetQuery,
        visualization_settings: MCP_APP_VISUALIZATION_SETTINGS,
      },
      initialSqlParameters: getInitialSqlParameters(parameters),
    };
  } catch {
    return null;
  }
}

/**
 * Key each bound value by its template-tag name, the form `initialSqlParameters` takes.
 * The parameters are matched to the question's own template-tag parameters by slug, so
 * putting them on the card instead would not work: they carry no `id`, and a card-level
 * `parameters` array short-circuits the tag-derived one it needs to be matched against.
 */
function getInitialSqlParameters(parameters: unknown): SqlParameterValues {
  if (!Array.isArray(parameters)) {
    return {};
  }

  return Object.fromEntries(
    parameters.flatMap((parameter) => {
      const [, tag] = parameter?.target ?? [];
      const [tagType, tagName] = tag ?? [];

      return tagType === "template-tag" && typeof tagName === "string"
        ? [[tagName, parameter.value]]
        : [];
    }),
  );
}
