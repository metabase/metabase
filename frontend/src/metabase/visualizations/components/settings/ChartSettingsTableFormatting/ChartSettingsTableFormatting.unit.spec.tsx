import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  createMockDOMRect,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { ColumnFormattingSetting } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import {
  ChartSettingsTableFormatting,
  type ChartSettingsTableFormattingProps,
} from "./ChartSettingsTableFormatting";

const STRING_COLUMN = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column",
  name: "STRING_COLUMN",
});

const STRING_COLUMN_TWO = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column 2",
  name: "STRING_COLUMN_2",
});

const BOOLEAN_COLUMN = createMockColumn({
  base_type: "type/Boolean",
  display_name: "Boolean Column",
  name: "BOOLEAN_COLUMN",
});

const NUMBER_COLUMN = createMockColumn({
  base_type: "type/Integer",
  display_name: "Number Column",
  name: "NUMBER_COLUMN",
});

const PRIMARY_KEY_COLUMN = createMockColumn({
  base_type: "type/Integer",
  semantic_type: "type/PK",
  display_name: "Primary Key Column",
  name: "PK_COLUMN",
});

const FOREIGN_KEY_COLUMN = createMockColumn({
  base_type: "type/Integer",
  semantic_type: "type/FK",
  display_name: "Foreign Key Column",
  name: "FK_COLUMN",
});

const COLUMNS = [
  STRING_COLUMN,
  STRING_COLUMN_TWO,
  BOOLEAN_COLUMN,
  NUMBER_COLUMN,
  PRIMARY_KEY_COLUMN,
  FOREIGN_KEY_COLUMN,
];

const STRING_OPERATORS = [
  "is null",
  "is not null",
  "is equal to",
  "is not equal to",
  "contains",
  "does not contain",
  "starts with",
  "ends with",
];

const NUMBER_OPERATORS = [
  "is null",
  "is not null",
  "is equal to",
  "is not equal to",
  "is less than",
  "is greater than",
  "is less than or equal to",
  "is greater than or equal to",
];

const BOOLEAN_OPERATORS = ["is null", "is not null", "is true", "is false"];

type WrapperProps = Partial<ChartSettingsTableFormattingProps> & {
  initialValue?: ColumnFormattingSetting[];
};

const Wrapper = ({ initialValue = [], ...props }: WrapperProps = {}) => {
  const [value, setValue] = useState<ColumnFormattingSetting[]>(initialValue);

  return (
    <ChartSettingsTableFormatting
      cols={COLUMNS}
      onChange={setValue}
      value={value}
      {...props}
    />
  );
};

const setup = (props: WrapperProps = {}) => {
  render(<Wrapper {...props} />);
};

describe("ChartSettingsTableFormatting", () => {
  it("should allow you to add a rule", async () => {
    setup();
    expect(screen.getByText("Conditional formatting")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Add a rule"));
    await userEvent.click(await screen.findByText("String Column"));
    //Dismiss Popup
    await userEvent.click(
      await screen.findByText("Which columns should be affected?"),
    );

    expect(await screen.findByText("is equal to")).toBeInTheDocument();

    await userEvent.type(
      await screen.findByTestId("conditional-formatting-value-input"),
      "toucan",
    );
    await userEvent.click(await screen.findByText("Add rule"));

    expect(await screen.findByText("String Column")).toBeInTheDocument();
    expect(await screen.findByText(/is equal to toucan/)).toBeInTheDocument();
  });

  it("should only let you choose columns of the same type for a rule", async () => {
    setup();
    expect(screen.getByText("Conditional formatting")).toBeInTheDocument();
    await userEvent.click(await screen.findByText("Add a rule"));
    await userEvent.click(await screen.findByText("String Column"));

    expect(
      await screen.findByRole("option", { name: "Number Column" }),
    ).toHaveAttribute("data-combobox-disabled", "true");

    expect(
      await screen.findByRole("option", { name: "Boolean Column" }),
    ).toHaveAttribute("data-combobox-disabled", "true");

    expect(
      await screen.findByRole("option", { name: "String Column 2" }),
    ).not.toHaveAttribute("data-combobox-disabled");
  });

  describe("should show appropriate operators based on column selection", () => {
    beforeEach(async () => {
      setup();
      await userEvent.click(screen.getByText("Add a rule"));
    });

    it("string", async () => {
      await userEvent.click(screen.getByText("String Column"));
      //Dismiss Popup
      await userEvent.click(
        screen.getByText("Which columns should be affected?"),
      );

      await userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      STRING_OPERATORS.forEach((operator) => {
        expect(
          screen.getByRole("option", { name: operator }),
        ).toBeInTheDocument();
      });
    });

    it("number primary key (metabase#17448)(VIZ-379)", async () => {
      await userEvent.click(screen.getByText("Primary Key Column"));
      //Dismiss Popup
      await userEvent.click(
        screen.getByText("Which columns should be affected?"),
      );

      await userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      STRING_OPERATORS.forEach((operator) => {
        expect(
          screen.getByRole("option", { name: operator }),
        ).toBeInTheDocument();
      });
    });

    it("number foreign key (metabase#17448)(VIZ-379)", async () => {
      await userEvent.click(screen.getByText("Foreign Key Column"));
      //Dismiss Popup
      await userEvent.click(
        screen.getByText("Which columns should be affected?"),
      );

      await userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      STRING_OPERATORS.forEach((operator) => {
        expect(
          screen.getByRole("option", { name: operator }),
        ).toBeInTheDocument();
      });
    });

    it("number", async () => {
      await userEvent.click(screen.getByText("Number Column"));
      //Dismiss Popup
      await userEvent.click(
        screen.getByText("Which columns should be affected?"),
      );

      await userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      NUMBER_OPERATORS.forEach((operator) => {
        expect(
          screen.getByRole("option", { name: operator }),
        ).toBeInTheDocument();
      });

      // Quick check for color range option on numeric rules
      expect(screen.getByText("Formatting style")).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /single color/i }),
      ).toBeChecked();
      expect(
        screen.getByRole("radio", { name: /color range/i }),
      ).not.toBeChecked();
    });

    it("boolean", async () => {
      await userEvent.click(screen.getByText("Boolean Column"));
      //Dismiss Popup
      await userEvent.click(
        screen.getByText("Which columns should be affected?"),
      );

      await userEvent.click(
        screen.getByTestId("conditional-formatting-value-operator-button"),
      );

      BOOLEAN_OPERATORS.forEach((operator) => {
        expect(
          screen.getByRole("option", { name: operator }),
        ).toBeInTheDocument();
      });
    });
  });
});

describe("ChartSettingsTableFormatting rule list", () => {
  const TAX_COLUMN = createMockColumn({
    base_type: "type/Float",
    display_name: "Tax",
    name: "TAX",
  });
  const SUBTOTAL_COLUMN = createMockColumn({
    base_type: "type/Float",
    display_name: "Subtotal",
    name: "SUBTOTAL",
  });

  const createTaxRule = (
    value: number,
    color: string,
  ): ColumnFormattingSetting => ({
    type: "single",
    operator: "<",
    value,
    color,
    highlight_row: false,
    columns: ["TAX"],
  });

  const RULES = [
    createTaxRule(3, "#509EE3"),
    createTaxRule(6, "#88BF4D"),
    createTaxRule(10, "#EF8C8C"),
  ];

  const PREVIEW_HEIGHT = 100;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const getPreviews = () => screen.getAllByTestId("formatting-rule-preview");

  const getPreviewText = (columnName: string, value: number) =>
    `${columnName}When a cell in these columns is less than ${value} it will be tinted this color.`;

  const getPreviewTexts = () =>
    getPreviews().map((preview) => preview.textContent);

  /**
   * jsdom has no layout. Gives each rule preview, and the sortable wrapper
   * around it, a rect from its position in the list, so that dnd-kit can find
   * the rule that a dragged one crosses.
   */
  const mockPreviewRects = ({ draggedIndex }: { draggedIndex: number }) => {
    const ruleCount = getPreviews().length;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (!(this instanceof HTMLElement)) {
          return createMockDOMRect();
        }
        const previews = within(this).queryAllByTestId(
          "formatting-rule-preview",
        );
        const preview =
          this.dataset.testid === "formatting-rule-preview"
            ? this
            : previews.length === 1
              ? previews[0]
              : null;
        if (preview == null) {
          return createMockDOMRect({ width: 300, height: 1000 });
        }
        const index = getPreviews().indexOf(preview);
        // the drag overlay renders its copy of the dragged rule after the
        // list, and the copy starts where the dragged rule is
        const y = (index < ruleCount ? index : draggedIndex) * PREVIEW_HEIGHT;
        return createMockDOMRect({
          x: 0,
          y,
          top: y,
          left: 0,
          width: 300,
          height: PREVIEW_HEIGHT,
          right: 300,
          bottom: y + PREVIEW_HEIGHT,
        });
      });
  };

  const dragPreview = async ({ from, to }: { from: number; to: number }) => {
    const startY = from * PREVIEW_HEIGHT + PREVIEW_HEIGHT / 2;
    const endY = to * PREVIEW_HEIGHT + PREVIEW_HEIGHT / 4;
    const preview = getPreviews()[from];

    fireEvent.mouseDown(preview, { button: 0, clientX: 10, clientY: startY });
    fireEvent.mouseMove(document, { clientX: 10, clientY: startY - 20 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: endY });
    fireEvent.mouseUp(document, { clientX: 10, clientY: endY });
    // the drag overlay renders a copy of the rule until its drop animation ends
    await waitFor(() => expect(getPreviews()).toHaveLength(3));
  };

  it("should be able to remove, add, and re-order rules", async () => {
    setup({ cols: [TAX_COLUMN, SUBTOTAL_COLUMN], initialValue: RULES });
    expect(getPreviewTexts()).toEqual([
      getPreviewText("Tax", 3),
      getPreviewText("Tax", 6),
      getPreviewText("Tax", 10),
    ]);

    // remove the first rule
    await userEvent.click(
      within(getPreviews()[0]).getByRole("img", { name: /close/ }),
    );
    expect(getPreviewTexts()).toEqual([
      getPreviewText("Tax", 6),
      getPreviewText("Tax", 10),
    ]);

    // add a rule for another column, with an operator, a value and a color
    // that are not the defaults
    await userEvent.click(screen.getByRole("button", { name: /add a rule/i }));
    // the column picker opens at once
    await userEvent.click(
      await screen.findByRole("option", { name: "Subtotal" }),
    );
    await userEvent.click(
      screen.getByText("Which columns should be affected?"),
    );
    await userEvent.click(
      screen.getByTestId("conditional-formatting-value-operator-button"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "is less than" }),
    );
    await userEvent.type(
      screen.getByTestId("conditional-formatting-value-input"),
      "20",
    );
    await userEvent.click(
      screen.getByTestId("conditional-formatting-color-selector"),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /#F2A86F/i }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Add rule" }));

    expect(getPreviewTexts()).toEqual([
      getPreviewText("Subtotal", 20),
      getPreviewText("Tax", 6),
      getPreviewText("Tax", 10),
    ]);
    // the new rule keeps the chosen color
    await userEvent.click(getPreviews()[0]);
    expect(
      screen.getByTestId("conditional-formatting-color-selector"),
    ).toHaveAccessibleName("#F2A86F");
    await userEvent.click(screen.getByRole("button", { name: "Update rule" }));

    // move the last rule to the top
    mockPreviewRects({ draggedIndex: 2 });
    await dragPreview({ from: 2, to: 0 });
    await waitFor(() =>
      expect(getPreviewTexts()).toEqual([
        getPreviewText("Tax", 10),
        getPreviewText("Subtotal", 20),
        getPreviewText("Tax", 6),
      ]),
    );
  });
});
