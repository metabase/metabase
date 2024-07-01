import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { Card, Database } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeCard,
  createMockTable,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionActions } from "./QuestionActions";

const ICON_CASES_CARDS = [
  createMockCard({ name: "GUI" }),
  createMockNativeCard({ name: "SQL" }),
];

const ICON_CASES_LABELS = [
  { label: "bookmark icon", tooltipText: "Bookmark" },
  { label: "info icon", tooltipText: "More info" },
  {
    label: "Move, trash, and more...",
    tooltipText: "Move, trash, and more...",
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
      tables: [createMockTable({ id: `card__${card.id}` })],
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

  describe("model query & metadata", () => {
    it("should allow to edit the model with write data & collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(screen.getByText("Edit query definition")).toBeInTheDocument();
      expect(screen.getByText("Edit metadata")).toBeInTheDocument();
    });

    it("should not allow to edit the model without write collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: false,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(
        screen.queryByText("Edit query definition"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
    });

    it("should not allow to edit the model without data permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
        databases: [],
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(
        screen.queryByText("Edit query definition"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
    });
  });

  describe("turning into a model or question", () => {
    it("should allow to turn into a model with write data & collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "question",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(screen.getByText("Turn into a model")).toBeInTheDocument();
    });

    it("should allow to turn into a question with write data & collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(
        screen.getByText("Turn back to saved question"),
      ).toBeInTheDocument();
    });

    it("should not allow turn into a model without write collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: false,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(screen.queryByText("Turn int a model")).not.toBeInTheDocument();
    });

    it("should not allow turn into a question without write collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: false,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(
        screen.queryByText("Turn back to saved question"),
      ).not.toBeInTheDocument();
    });

    it("should not allow to turn into a model without data permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
        databases: [],
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(screen.queryByText("Turn into a model")).not.toBeInTheDocument();
    });

    it("should not allow to turn into a question without data permissions", async () => {
      setup({
        card: createMockCard({
          type: "question",
          can_write: true,
        }),
        databases: [],
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(
        screen.queryByText("Turn back to saved question"),
      ).not.toBeInTheDocument();
    });
  });

  it("should not render the menu when there are no menu items", () => {
    setup({
      card: createMockCard({
        type: "model",
        can_write: false,
      }),
      databases: [],
    });

    expect(getIcon("info")).toBeInTheDocument();
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });
});
