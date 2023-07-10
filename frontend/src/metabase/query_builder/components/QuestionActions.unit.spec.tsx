import userEvent from "@testing-library/user-event";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import QuestionActions from "metabase/query_builder/components/QuestionActions";
import { createMockCard, createMockNativeCard } from "metabase-types/api/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { Card } from "metabase-types/api";
import Question from "metabase-lib/Question";

const TEST_STRUCTURED_CARD = createMockCard();
const TEST_NATIVE_CARD = createMockNativeCard();

const iconList = [
  { label: "bookmark icon", tooltipText: "Bookmark" },
  { label: "info icon", tooltipText: "More info" },
  {
    label: "Move, archive, and more...",
    tooltipText: "Move, archive, and more...",
  },
];

function setup({ card }: { card: Card }) {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = metadata.question(card.id) as Question;

  renderWithProviders(
    <QuestionActions
      isBookmarked={false}
      isShowingQuestionInfoSidebar={false}
      handleBookmark={jest.fn()}
      onOpenModal={jest.fn()}
      question={question}
      setQueryBuilderMode={jest.fn()}
      turnDatasetIntoQuestion={jest.fn()}
      onInfoClick={jest.fn()}
      onModelPersistenceChange={jest.fn()}
    />,
    { storeInitialState: state },
  );
}

describe("QuestionActions", () => {
  ["structured", "native"].forEach(queryType => {
    iconList.forEach(({ label, tooltipText }) => {
      it(`should display the "${label}" icon with the "${tooltipText}" tooltip for ${queryType} questions`, async () => {
        setup({
          card:
            queryType === "structured"
              ? TEST_STRUCTURED_CARD
              : TEST_NATIVE_CARD,
        });

        await userEvent.hover(screen.getByRole("button", { name: label }));
        const tooltip = screen.getByRole("tooltip", { name: tooltipText });
        expect(tooltip).toHaveAttribute("data-placement", "top");
        expect(tooltip).toHaveTextContent(tooltipText);
      });
    });
  });

  it("should allow to edit the model only with write permissions", () => {
    setup({
      card: createMockCard({
        can_write: true,
        dataset: true,
      }),
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.getByText("Edit query definition")).toBeInTheDocument();
    expect(screen.getByText("Edit metadata")).toBeInTheDocument();
  });

  it("should not allow to edit the model without write permissions", () => {
    setup({
      card: createMockCard({
        can_write: false,
        dataset: true,
      }),
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit query definition")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
  });
});
