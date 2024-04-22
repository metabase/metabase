import type {
  EmbeddingSessionTokenState,
  LoginStatus,
  SdkState,
} from "embedding-sdk/store/types";

const createMockTokenState = ({
  ...opts
}: {
  opts?: Partial<EmbeddingSessionTokenState>;
} = {}): EmbeddingSessionTokenState => {
  return { error: null, loading: false, token: null, ...opts };
};

const createMockLoginStatusState = ({
  status,
  ...opts
}: {
  status?: LoginStatus["status"];
  opts?: Partial<LoginStatus>;
} = {}): LoginStatus => {
  if (status === "error") {
    return { error: new Error("An error occurred"), status: "error", ...opts };
  }

  return { status: status ?? "uninitialized", ...opts };
};

export const createMockSdkState = ({
  ...opts
}: {
  opts?: Partial<SdkState>;
} = {}): SdkState => {
  return {
    loginStatus: createMockLoginStatusState(),
    token: createMockTokenState(),
    ...opts,
  };
};
