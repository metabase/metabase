import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";

export type MetabaseEmbeddingSessionToken = {
  id: string;
  exp: number;
};

/**
 * @inline
 */
export type UserBackendJwtResponse = {
  jwt: string;
};

export type MetabaseFetchRequestTokenFn = () => Promise<UserBackendJwtResponse>;

export type MetabaseFetchStaticTokenFnData =
  | {
      entityType: "dashboard";
      entityId: SdkDashboardId;
    }
  | {
      entityType: "question";
      entityId: SdkQuestionId;
    };

export type MetabaseFetchStaticTokenFn = (
  data: MetabaseFetchStaticTokenFnData,
) => Promise<UserBackendJwtResponse>;
