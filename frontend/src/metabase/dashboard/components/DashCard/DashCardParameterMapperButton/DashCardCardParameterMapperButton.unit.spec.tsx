import userEvent from "@testing-library/user-event";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  Card,
  DashboardCard,
  ParameterDimensionTarget,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDatabase,
  createMockField,
  createMockParameter,
  createMockTable,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { TEST_DASHBOARD_STATE } from "metabase/dashboard/components/DashboardTabs/test-utils";
import { DashCardCardParameterMapperButton } from "metabase/dashboard/components/DashCard/DashCardParameterMapperButton/DashCardCardParameterMapperButton";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { checkNotNull } from "metabase/lib/types";

const TEST_TARGET_FIELD = createMockField({ id: 1, name: "ID" });

const TEST_DIMENSION_TARGET: ParameterDimensionTarget = [
  "dimension",
  ["field", Number(TEST_TARGET_FIELD.id), null],
];

const TEST_TABLE = createMockTable({
  id: ORDERS_ID,
  fields: [TEST_TARGET_FIELD],
});

const TEST_DASHBOARD = createMockDashboard();

const TEST_CARD = TEST_DASHBOARD_STATE.dashcards[1].card;
const TEST_DASHCARD: DashboardCard = TEST_DASHBOARD_STATE.dashcards[1];
const TEST_VIRTUAL_DASHCARD: DashboardCard = {
  ...TEST_DASHCARD,
  visualization_settings: {
    virtual_card: { ...TEST_CARD, display: "link" },
  },
};

const TEST_UNAUTHORIZED_CARD = createMockCard({
  dataset_query: undefined,
});

const TEST_DB = createMockDatabase({
  id: checkNotNull(TEST_CARD.dataset_query.database),
});

const setup = ({
  dashcard = TEST_DASHCARD,
  card = TEST_CARD,
  isDisabled = false,
  isMobile = false,
  target = undefined,
}: {
  dashcard?: DashboardCard;
  card?: Card;
  isDisabled?: boolean;
  isMobile?: boolean;
  target?: ParameterDimensionTarget | undefined;
} = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
      databases: [TEST_DB],
      tables: [TEST_TABLE],
      dashboards: [TEST_DASHBOARD],
    }),
    dashboard: {
      ...TEST_DASHBOARD_STATE,
      dashboards: {
        1: {
          ...TEST_DASHBOARD_STATE.dashboards[1],
          parameters: [createMockParameter()],
        },
      },
      sidebar: {
        name: SIDEBAR_NAME.editParameter,
        props: { parameterId: "1" },
      },
    },
  });

  const handleChangeTargetMock = jest.fn();

  renderWithProviders(
    <DashCardCardParameterMapperButton
      dashcard={dashcard}
      card={card}
      isDisabled={isDisabled}
      isMobile={isMobile}
      handleChangeTarget={handleChangeTargetMock}
      target={target}
    />,
    { storeInitialState: state },
  );

  return { handleChangeTargetMock };
};

describe("DashCardCardParameterMapperButton", () => {
  describe("the different states of the button", () => {
    it("should display 'unauthorized' message if the user doesn't have permission to map parameters", () => {
      setup({ card: TEST_UNAUTHORIZED_CARD });
      const targetButton = screen.getByRole("button");
      expect(targetButton).toHaveAttribute(
        "aria-label",
        "You don’t have permission to see this question’s columns.",
      );
      expect(targetButton).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByLabelText("key icon")).toBeInTheDocument();
    });

    it("should display 'disabled' message if the dashcard is disabled and not virtual", () => {
      setup({ isDisabled: true });
      const targetButton = screen.getByRole("button");
      expect(targetButton).toHaveAttribute(
        "aria-label",
        "This card doesn't have any fields or parameters that can be mapped to this parameter type.",
      );
      expect(targetButton).toHaveAttribute("aria-disabled", "true");
      expect(targetButton).toHaveTextContent("No valid fields");
    });

    it("should display mapping if the card is provided with the 'selectedMappingOption' prop", () => {
      setup({
        target: TEST_DIMENSION_TARGET,
      });

      expect(
        screen.getByText(TEST_TARGET_FIELD.display_name),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("close icon")).toBeInTheDocument();
    });

    it("should display 'Unknown field' if a target is provided but a mapping option isn't found", () => {
      setup({ target: ["dimension", ["field", -1, null]] });
      expect(screen.getByText("Unknown Field")).toBeInTheDocument();
      expect(screen.getByLabelText("close icon")).toBeInTheDocument();
    });

    it("should display 'Select…' dropdown if a target isn't selected and a mapping option isn't found", () => {
      setup();
      const targetButton = screen.getByRole("button");
      expect(targetButton).toHaveTextContent("Select…");
      expect(targetButton).toHaveAttribute("aria-disabled", "false");
      expect(screen.getByLabelText("chevrondown icon")).toBeInTheDocument();
    });
  });

  describe("the different states of the header content", () => {
    it("should display 'Variable to map to' if the card is virtual", () => {
      setup({ dashcard: TEST_VIRTUAL_DASHCARD });
      expect(screen.getByText("Variable to map to")).toBeInTheDocument();
    });

    it("should display 'Column to filter on' if the card is not virtual, not native, and not disabled", () => {
      setup();
      expect(screen.getByText("Column to filter on")).toBeInTheDocument();
    });

    it("should not display a header if isMobile is true", () => {
      setup({
        dashcard: {
          ...TEST_DASHCARD,
          card: { ...TEST_DASHCARD.card, display: "link" },
        },
        isMobile: true,
      });
      expect(screen.queryByText("Column to filter on")).not.toBeInTheDocument();
    });

    it("should not display a header if the dashcard size_y < 2", () => {
      setup({ dashcard: { ...TEST_DASHCARD, size_y: 1 } });
      expect(screen.queryByText("Column to filter on")).not.toBeInTheDocument();
    });
  });

  describe("when the user can map parameters and the dashcard can be mapped to", () => {
    it("should display a list of options to map to", async () => {
      setup();
      const targetButton = screen.getByRole("button");
      userEvent.click(targetButton);
      expect(
        await screen.findByText(TEST_TARGET_FIELD.display_name),
      ).toBeInTheDocument();
    });

    it("should change the target when an option is chosen", async () => {
      const { handleChangeTargetMock } = setup();
      const targetButton = screen.getByRole("button");
      userEvent.click(targetButton);
      const targetOption = await screen.findByText(
        TEST_TARGET_FIELD.display_name,
      );
      userEvent.click(targetOption);
      expect(handleChangeTargetMock).toHaveBeenCalledWith(
        TEST_DIMENSION_TARGET,
      );
    });

    it("should remove the target when 'X' is clicked on the dropdown", () => {
      const { handleChangeTargetMock } = setup({
        target: TEST_DIMENSION_TARGET,
      });

      userEvent.click(screen.getByLabelText("close icon"));

      expect(handleChangeTargetMock).toHaveBeenCalledWith(null);
    });
  });
});
