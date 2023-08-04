import userEvent from "@testing-library/user-event";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Database } from "metabase-types/api";
import { createMockCard, createMockNativeCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import Question from "metabase-lib/Question";
import QuestionActions from "./QuestionActions";

const ICON_CASES_CARDS = [
  createMockCard({ name: "GUI" }),
  createMockNativeCard({ name: "SQL" }),
];

const ICON_CASES_LABELS = [
  { label: "bookmark icon", tooltipText: "Bookmark" },
  { label: "info icon", tooltipText: "More info" },
  {
    label: "Move, archive, and more...",
    tooltipText: "Move, archive, and more...",
  },
];

const ICON_CASES = ICON_CASES_CARDS.flatMap(card =>
  ICON_CASES_LABELS.map(labels => ({ ...labels, card })),
);

interface SetupOpts {
  card: Card;
  databases?: Database[];
}

function setup({ card, databases = [createSampleDatabase()] }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases,
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
  it.each(ICON_CASES)(
    `should display the "$label" icon with the "$tooltipText" tooltip for $card.name questions`,
    async ({ label, tooltipText, card }) => {
      setup({ card });

      await userEvent.hover(screen.getByRole("button", { name: label }));
      const tooltip = screen.getByRole("tooltip", { name: tooltipText });
      expect(tooltip).toHaveAttribute("data-placement", "top");
      expect(tooltip).toHaveTextContent(tooltipText);
    },
  );

  it("should allow to edit the model only with write permissions", () => {
    setup({
      card: createMockCard({
        dataset: true,
        can_write: true,
      }),
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.getByText("Edit query definition")).toBeInTheDocument();
    expect(screen.getByText("Edit metadata")).toBeInTheDocument();
  });

  it("should not allow to edit the model without write permissions", () => {
    setup({
      card: createMockCard({
        dataset: true,
        can_write: false,
      }),
    });

    userEvent.click(getIcon("ellipsis"));
    expect(screen.queryByText("Edit query definition")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
  });

  it("should not render the menu when there are no menu items", () => {
    setup({
      card: createMockCard({
        dataset: true,
        can_write: false,
      }),
      databases: [],
    });

    expect(getIcon("info")).toBeInTheDocument();
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });
});
