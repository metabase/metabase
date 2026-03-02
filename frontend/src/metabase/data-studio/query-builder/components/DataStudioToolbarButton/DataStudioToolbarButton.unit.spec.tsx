import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { CardType } from "metabase-types/api";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";

import { DataStudioToolbarButton } from "./DataStudioToolbarButton";

const setup = ({
  type = "metric",
  is_superuser = false,
  is_data_analyst = true,
}: {
  type?: CardType;
  is_data_analyst?: boolean;
  is_superuser?: boolean;
} = {}) => {
  const question = new Question(
    createMockCard({
      type,
    }),
  );

  renderWithProviders(<DataStudioToolbarButton question={question} />, {
    storeInitialState: {
      currentUser: createMockUser({
        is_data_analyst,
        is_superuser,
      }),
    },
  });
};

describe("DataStudioToolbarButton", () => {
  it("should render a button if the card is a metric and the user has data studio access", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: "Open in Data Studio" }),
    ).toBeInTheDocument();
  });

  it("should render a button if the card is a metric and the user is an admin", async () => {
    setup({ is_superuser: true, is_data_analyst: false });

    expect(
      await screen.findByRole("button", { name: "Open in Data Studio" }),
    ).toBeInTheDocument();
  });

  it("should not render a button if the card is a model", async () => {
    setup({ type: "model" });

    expect(
      screen.queryByRole("button", { name: "Open in Data Studio" }),
    ).not.toBeInTheDocument();
  });

  it("should not render a button if the card is a question", async () => {
    setup({ type: "question" });

    expect(
      screen.queryByRole("button", { name: "Open in Data Studio" }),
    ).not.toBeInTheDocument();
  });
});
