import type {
  CheckCardDependenciesRequest,
  CheckDependenciesResponse,
  CheckSnippetDependenciesRequest,
  CheckTransformDependenciesRequest,
} from "metabase-types/api";

export function createMockCheckCardDependenciesRequest(
  opts?: Partial<CheckCardDependenciesRequest>,
): CheckCardDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckSnippetDependenciesRequest(
  opts?: Partial<CheckSnippetDependenciesRequest>,
): CheckSnippetDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckTransformDependenciesRequest(
  opts?: Partial<CheckTransformDependenciesRequest>,
): CheckTransformDependenciesRequest {
  return {
    id: 1,
    ...opts,
  };
}

export function createMockCheckDependenciesResponse(
  opts?: Partial<CheckDependenciesResponse>,
): CheckDependenciesResponse {
  return {
    success: true,
    ...opts,
  };
}
