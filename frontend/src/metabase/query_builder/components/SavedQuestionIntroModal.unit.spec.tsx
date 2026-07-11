import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { SavedQuestionIntroModal } from "./SavedQuestionIntroModal";

const setup = () => {
  const metadata = createMockMetadata({});
  const question = new Question(createMockCard(), metadata);
  const onClose = jest.fn();

  renderWithProviders(
    <SavedQuestionIntroModal
      question={question}
      isShowingNewbModal
      onClose={onClose}
    />,
  );

  return { onClose };
};

describe("SavedQuestionIntroModal", () => {
  it("renders the qbnewb disclaimer", () => {
    setup();
    expect(
      screen.getByText("It's okay to play around with saved questions"),
    ).toBeInTheDocument();
  });

  // Regression test for metabase#44754: the modal must be dismissable with the
  // keyboard. The bug was that the disclaimer used a custom modal that ignored
  // the Escape key; switching to the Mantine Modal wired up onClose on Escape.
  it("closes on Escape (metabase#44754)", async () => {
    const { onClose } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the primary button is clicked", async () => {
    const { onClose } = setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Start exploring" }),
    );

    expect(onClose).toHaveBeenCalled();
  });
});
