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
    return { error: new Error("An error occurred"), status: "error", ...opts };
  }

  return { status: status ?? "success", ...opts };
};

export const createMockSdkState = ({
  ...opts
}: Partial<SdkState> = {}): SdkState => {
  return {
    loginStatus: createMockLoginStatusState(),
    token: createMockTokenState(),
    plugins: {},
    loaderComponent: null,
    errorComponent: null,
    ...opts,
  };
};
