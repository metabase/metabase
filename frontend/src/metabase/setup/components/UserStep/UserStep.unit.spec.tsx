import { UserInfo } from "metabase-types/store";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSetupState,
  createMockState,
  createMockUserInfo,
} from "metabase-types/store/mocks";
import { DATABASE_STEP, USER_STEP } from "../../constants";
import { UserStep } from "./UserStep";

interface SetupOpts {
  step?: number;
  user?: UserInfo;
}

const setup = ({ step = USER_STEP, user }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      user,
    }),
  });

  renderWithProviders(<UserStep />, { storeInitialState: state });
};

describe("UserStep", () => {
  it("should render in active state", () => {
    setup({ step: USER_STEP });

    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    setup({
      step: DATABASE_STEP,
      user: createMockUserInfo({ first_name: "Testy" }),
    });

    expect(screen.getByText(/Hi, Testy/)).toBeInTheDocument();
  });
});
