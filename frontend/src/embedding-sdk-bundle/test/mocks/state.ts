import type {
  EmbeddingSessionTokenState,
  SdkState,
} from "embedding-sdk-bundle/store/types";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";

export const createMockTokenState = ({
  ...opts
}: Partial<EmbeddingSessionTokenState> = {}): EmbeddingSessionTokenState => {
  return { error: null, loading: false, token: null, ...opts };
};

export const createMockLoginStatusState = ({
  status,
  ...opts
}: {
  status?: LoginStatus["status"];
} & Partial<LoginStatus> = {}): LoginStatus => {
  if (status === "error") {
    return { error: new Error("An error occurred"), status: "error", ...opts };
  }

  return { status: status ?? "success", ...opts };
};

export const createMockSdkState = ({
  ...opts
}: Partial<SdkState> = {}): SdkState => {
  return {
    metabaseInstanceUrl: "",
    metabaseInstanceVersion: null,
    isGuestEmbed: false,
    initStatus: createMockLoginStatusState(),
    token: createMockTokenState(),
    usageProblem: null,
    plugins: {},
    eventHandlers: {},
    errorComponent: null,
    error: null,
    fetchRefreshTokenFn: null,
    ...opts,
  };
};
