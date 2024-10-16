import type {
  EmbeddingSessionTokenState,
  LoginStatus,
  SdkState,
} from "embedding-sdk/store/types";

export const createMockTokenState = ({
  ...opts
}: Partial<LoginStatus> = {}): EmbeddingSessionTokenState => {
  return { error: null, loading: false, token: null, ...opts };
};

export const createMockLoginStatusState = ({
  status,
  ...opts
}: {
  status?: LoginStatus["status"];
} & Partial<LoginStatus> = {}): LoginStatus => {
  if (status === "error") {
    return { status: "error", data: { status: "error-unknown" }, ...opts };
  }

  return { status: status ?? "success", ...opts };
};

export const createMockSdkState = ({
  ...opts
}: Partial<SdkState> = {}): SdkState => {
  return {
    metabaseInstanceUrl: "",
    loginStatus: createMockLoginStatusState(),
    token: createMockTokenState(),
    usageProblem: null,
    plugins: {},
    eventHandlers: {},
    loaderComponent: null,
    errorComponent: null,
    fetchRefreshTokenFn: null,
    ...opts,
  };
};
