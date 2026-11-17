import type {
  MetabaseCollection,
  MetabaseCollectionItem,
} from "embedding-sdk-bundle/types/collection";
import type { MetabaseDashboard } from "embedding-sdk-bundle/types/dashboard";
import type { MetabaseQuestion } from "embedding-sdk-bundle/types/question";
import type { MetabaseUser } from "embedding-sdk-bundle/types/user";

const MOCK_TIMESTAMP = "2024-01-01T00:00:00Z";

export function createMockUser(opts?: Partial<MetabaseUser>): MetabaseUser {
  const firstName = opts?.first_name ?? "Testy";
  const lastName = opts?.last_name ?? "Tableton";

  return {
    id: 1,
    first_name: firstName,
    last_name: lastName,
    common_name: [firstName, lastName].filter(Boolean).join(" "),
    email: "user@example.com",
    locale: null,
    date_joined: MOCK_TIMESTAMP,
    first_login: MOCK_TIMESTAMP,
    last_login: MOCK_TIMESTAMP,
    ...opts,
  };
}

export function createMockDashboard(
  opts?: Partial<MetabaseDashboard>,
): MetabaseDashboard {
  return {
    id: 1,
    entity_id: "mockDashboardEntityId",
    created_at: MOCK_TIMESTAMP,
    updated_at: MOCK_TIMESTAMP,
    collection: null,
    name: "Dashboard",
    description: null,
    "last-edit-info": {
      id: 1,
      email: "user@example.com",
      first_name: "Testy",
      last_name: "Tableton",
      timestamp: MOCK_TIMESTAMP,
    },
    ...opts,
  };
}

export function createMockQuestion(
  opts?: Partial<MetabaseQuestion>,
): MetabaseQuestion {
  return {
    id: 1,
    name: "Question",
    description: null,
    entityId: "mockQuestionEntityId",
    isSavedQuestion: true,
    ...opts,
  };
}

export function createMockCollection(
  opts?: Partial<MetabaseCollection>,
): MetabaseCollection {
  return {
    id: 1,
    name: "Collection",
    entity_id: "mockCollectionEntityId",
    description: null,
    ...opts,
  };
}

export function createMockCollectionItem(
  opts?: Partial<MetabaseCollectionItem>,
): MetabaseCollectionItem {
  return {
    id: 1,
    entity_id: "mockQuestionEntityId",
    model: "card",
    name: "Question",
    description: null,
    ...opts,
  };
}
