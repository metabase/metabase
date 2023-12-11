import { screen, renderWithProviders } from "__support__/ui";
import { createMockTokenStatus } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";
import { checkNotNull } from "metabase/lib/types";
import { InteractiveEmbeddingCTA } from "./InteractiveEmbeddingCTA";

const setup = ({ isPaidPlan }: { isPaidPlan: boolean }) => {
  const { history } = renderWithProviders(<InteractiveEmbeddingCTA />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        "token-status": createMockTokenStatus({ valid: isPaidPlan }),
      }),
    }),
  });

  return {
    history: checkNotNull(history),
  };
};
describe("InteractiveEmbeddingCTA", () => {
  it("renders correctly for paid plan", () => {
    setup({ isPaidPlan: true });

    expect(screen.getByText("Interactive Embedding")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Set it up")).toHaveAttribute(
      "href",
      "/admin/settings/embedding-in-other-applications/full-app",
    );
  });

  it("renders correctly for OSS", () => {
    setup({ isPaidPlan: false });

    expect(screen.getByText("Interactive Embedding")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.",
      ),
    ).toBeInTheDocument();

    expect(screen.getByText("Learn more")).toHaveAttribute(
      "href",
      "https://www.metabase.com/product/embedded-analytics",
    );
  });
});
