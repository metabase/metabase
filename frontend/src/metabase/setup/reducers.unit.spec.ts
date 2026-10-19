import type { SetupState } from "metabase/redux/store";

type SetupReducer = (
  state: SetupState | undefined,
  action: { type: string },
) => SetupState;

const getInitialStateForUrl = (url: string): SetupState => {
  window.history.pushState({}, "", url);

  let initialState: SetupState | undefined;
  jest.isolateModules(() => {
    const { reducer } = jest.requireActual<{ reducer: SetupReducer }>(
      "./reducers",
    );
    initialState = reducer(undefined, { type: "@@INIT" });
  });

  if (!initialState) {
    throw new Error("The setup reducer did not return a state");
  }
  return initialState;
};

describe("setup reducer initial state", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("should pre-fill the user from the url, without a password (infra-frontend#1109)", () => {
    const { user } = getInitialStateForUrl(
      "/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited",
    );

    expect(user).toEqual({
      first_name: "John",
      last_name: "Doe",
      email: "john@doe.test",
      site_name: "Doe Unlimited",
      password: "",
      password_confirm: "",
    });
  });

  it("should start at the user step for the embedding use case", () => {
    const { step, isEmbeddingUseCase } = getInitialStateForUrl(
      "/setup?use_case=embedding",
    );

    expect(isEmbeddingUseCase).toBe(true);
    expect(step).toBe("user_info");
  });
});
