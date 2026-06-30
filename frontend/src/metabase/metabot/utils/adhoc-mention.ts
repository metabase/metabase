import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import type {
  CardDisplayType,
  DatasetQuery,
  MetabotAdhocQueryInfo,
} from "metabase-types/api";

export type AdhocChartPayload = {
  query: DatasetQuery;
  display?: CardDisplayType;
  name?: string;
};

const ADHOC_MENTION_MD_REGEX =
  /\[([^\]]+)\]\(metabase:\/\/adhoc\/([A-Za-z0-9_=-]+)\)/g;

export function encodeAdhocChartPayload(payload: AdhocChartPayload): string {
  return utf8_to_b64url(JSON.stringify(payload));
}

export function decodeAdhocChartPayload(
  encoded: string,
): AdhocChartPayload | null {
  try {
    const parsed: unknown = JSON.parse(b64url_to_utf8(encoded));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "query" in parsed &&
      typeof (parsed as { query: unknown }).query === "object"
    ) {
      return parsed as AdhocChartPayload;
    }
  } catch {
    return null;
  }
  return null;
}

export function createAdhocMentionLink({
  label,
  payload,
}: {
  label: string;
  payload: string;
}): string {
  return `[${label}](metabase://adhoc/${payload})`;
}

/**
 * Pulls ad-hoc chart mentions (`[label](metabase://adhoc/<b64>)`) out of a
 * metabot message: returns the message with each mention replaced by its plain
 * label, plus the decoded charts as `user_is_viewing` ad-hoc context items so the
 * model can act on them without the chart being saved.
 */
export function extractAdhocChartMentions(message: string): {
  message: string;
  items: MetabotAdhocQueryInfo[];
} {
  const items: MetabotAdhocQueryInfo[] = [];
  const cleaned = message.replace(
    ADHOC_MENTION_MD_REGEX,
    (_full, label: string, encoded: string) => {
      const decoded = decodeAdhocChartPayload(encoded);
      if (decoded) {
        items.push({ type: "adhoc", query: decoded.query });
      }
      return label;
    },
  );
  return { message: cleaned, items };
}
