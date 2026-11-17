import type { Principal, PrincipalType } from "./api";

export type PreviewRouteParams = {
  principalType?: string;
  principalId?: string;
};

export function isPrincipalType(value: unknown): value is PrincipalType {
  return value === "user" || value === "group" || value === "tenant";
}

export function parsePrincipalType(params: PreviewRouteParams): PrincipalType {
  return isPrincipalType(params.principalType) ? params.principalType : "user";
}

export function parsePrincipal(params: PreviewRouteParams): Principal | null {
  const id = Number(params.principalId);
  if (!isPrincipalType(params.principalType) || !Number.isInteger(id)) {
    return null;
  }
  return { type: params.principalType, id };
}
