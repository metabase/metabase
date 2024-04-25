import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { screen, renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { createMockTokenStatus } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { InteractiveEmbeddingCTA } from "./InteractiveEmbeddingCTA";

const setup = ({ isPaidPlan }: { isPaidPlan: boolean }) => {
  const { history } = renderWithProviders(
    <Route path="*" component={InteractiveEmbeddingCTA}></Route>,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState({
          "token-status": createMockTokenStatus({ valid: isPaidPlan }),
        }),
      }),
      withRouter: true,
    },
  );

  return {
    history: checkNotNull(history),
  };
};
describe("InteractiveEmbeddingCTA", () => {
  it("renders correctly for paid plan", async () => {
    const { history } = setup({ isPaidPlan: true });

    expect(screen.getByText("Interactive Embedding")).toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("interactive-embedding-cta"));

    expect(history.getCurrentLocation().pathname).toEqual(
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

    expect(screen.getByTestId("interactive-embedding-cta")).toHaveAttribute(
      "href",
      "https://www.metabase.com/product/embedded-analytics?utm_source=oss&utm_media=static-embed-popover",
    );
  });
});
