import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { Node, Token } from "./pratt";

export function getDatabase(
  query: Lib.Query,
  metadata?: Metadata,
): Database | null {
  const databaseId = Lib.databaseID(query);
  return metadata?.database(databaseId) ?? null;
}

type Nodable =
  | unknown[]
  | Lib.ExpressionParts
  | Lib.ExpressionArg
  | { node?: Node };

export function getNode(item?: Nodable): Node | undefined {
  if (typeof item === "object" && item !== null && "node" in item) {
    return item?.node;
  }
}

export function getToken(x?: Nodable): Token | undefined {
  return getNode(x)?.token ?? undefined;
}
