import { renderWithProviders, screen } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import type { UserInfo } from "metabase-types/store";
import {
  createMockSetupState,
  createMockState,
  createMockUserInfo,
} from "metabase-types/store/mocks";

import { UserStep } from "./UserStep";

interface SetupOpts {
  step?: SetupStep;
  user?: UserInfo;
}

const setup = ({ step = "user_info", user }: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      user,
    }),
  });

  renderWithProviders(<UserStep stepLabel={0} />, { storeInitialState: state });
};

describe("UserStep", () => {
  it("should render in active state", () => {
    setup({ step: "user_info" });

    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    setup({
      step: "db_connection",
      user: createMockUserInfo({ first_name: "Testy" }),
    });

    expect(screen.getByText(/Hi, Testy/)).toBeInTheDocument();
  });
});
