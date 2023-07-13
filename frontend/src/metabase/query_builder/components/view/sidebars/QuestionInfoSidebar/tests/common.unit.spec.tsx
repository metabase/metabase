import { createMockCard } from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup } from "./setup";

describe("QuestionInfoSidebar", () => {
  it.each([
    createMockCard({ name: "Question", dataset: false }),
    createMockCard({ name: "Model", dataset: true }),
  ])("should display description of a $card.name", async card => {
    await setup({ card });
    expect(screen.getByText(card.description ?? "")).toBeInTheDocument();
  });
});
