import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import {
  getIcon,
  queryIcon,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
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
    label: "Move, archive, and more...",
    tooltipText: "Move, archive, and more...",
  },
];

const ICON_CASES = ICON_CASES_CARDS.flatMap(card =>
  ICON_CASES_LABELS.map(labels => ({ ...labels, card })),
);

interface SetupOpts {
  card: Card;
  hasDataPermissions?: boolean;
}

function setup({ card, hasDataPermissions = true }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: hasDataPermissions ? [createSampleDatabase()] : [],
      tables: [createMockTable({ id: `card__${card.id}` })],
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = metadata.question(card.id) as Question;
  const onOpenModal = jest.fn();
  const onTurnModelIntoQuestion = jest.fn();
  const onSetQueryBuilderMode = jest.fn();

  renderWithProviders(
    <QuestionActions
      question={question}
      isBookmarked={false}
      isShowingQuestionInfoSidebar={false}
      onOpenModal={onOpenModal}
      onToggleBookmark={jest.fn()}
      onSetQueryBuilderMode={onSetQueryBuilderMode}
      onTurnModelIntoQuestion={onTurnModelIntoQuestion}
      onInfoClick={jest.fn()}
      onModelPersistenceChange={jest.fn()}
    />,
    { storeInitialState: state },
  );

  return { onOpenModal, onSetQueryBuilderMode, onTurnModelIntoQuestion };
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
      const { onSetQueryBuilderMode } = setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Edit query definition"));
      await waitFor(() => {
        expect(onSetQueryBuilderMode).toHaveBeenCalledWith("dataset", {
          datasetEditorTab: "query",
        });
      });

      await userEvent.click(screen.getByText("Edit metadata"));
      await waitFor(() => {
        expect(onSetQueryBuilderMode).toHaveBeenCalledWith("dataset", {
          datasetEditorTab: "metadata",
        });
      });
    });

    it("should not allow to edit the model without write collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: false,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      expect(
        screen.queryByText("Edit query definition"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Edit metadata")).not.toBeInTheDocument();
    });

    it("should allow to edit metadata but not the query without data permissions", async () => {
      setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
        hasDataPermissions: false,
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      expect(
        screen.queryByText("Edit query definition"),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Edit metadata")).toBeInTheDocument();
    });
  });

  describe("turning into a model or question", () => {
    it("should allow to turn into a model with write data & collection permissions", async () => {
      const { onOpenModal } = setup({
        card: createMockCard({
          type: "question",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Turn into a model"));
      expect(onOpenModal).toHaveBeenCalledWith(MODAL_TYPES.TURN_INTO_DATASET);
    });

    it("should allow to turn into a question with write data & collection permissions", async () => {
      const { onTurnModelIntoQuestion } = setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Turn back to saved question"));
      expect(onTurnModelIntoQuestion).toHaveBeenCalled();
    });

    it("should not allow to turn into a model without write collection permissions", async () => {
      setup({
        card: createMockCard({
          type: "question",
          can_write: false,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));
      await screen.findByRole("dialog");

      expect(screen.queryByText("Turn int a model")).not.toBeInTheDocument();
    });

    it("should not allow to turn into a question without write collection permissions", async () => {
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

    it("should allow to turn into a model without data permissions", async () => {
      const { onOpenModal } = setup({
        card: createMockCard({
          type: "question",
          can_write: true,
        }),
        hasDataPermissions: false,
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Turn into a model"));
      expect(onOpenModal).toHaveBeenCalledWith(MODAL_TYPES.TURN_INTO_DATASET);
    });

    it("should allow to turn into a question without data permissions", async () => {
      const { onTurnModelIntoQuestion } = setup({
        card: createMockCard({
          type: "model",
          can_write: true,
        }),
        hasDataPermissions: false,
      });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Turn back to saved question"));
      expect(onTurnModelIntoQuestion).toHaveBeenCalled();
    });
  });

  it("should not render the menu when there are no menu items", () => {
    setup({
      card: createMockCard({
        type: "model",
        can_write: false,
      }),
      hasDataPermissions: false,
    });

    expect(getIcon("info")).toBeInTheDocument();
    expect(queryIcon("ellipsis")).not.toBeInTheDocument();
  });
});
