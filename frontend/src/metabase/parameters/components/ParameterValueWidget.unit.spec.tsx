import userEvent from "@testing-library/user-event";
import { useState } from "react";

import {
  setupCardParameterRemappingEndpoint,
  setupCardParameterSearchEndpoint,
  setupCardParameterValuesEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  CardId,
  ParameterValueOrArray,
  ParameterValues,
  ValuesQueryType,
} from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";
import { createProductsRatingField } from "metabase-types/api/mocks/presets";

import { ParameterValueWidget } from "./ParameterValueWidget";

function setup({ parameter }: { parameter?: Partial<UiParameter> } = {}) {
  const defaultParameter: UiParameter = {
    ...createMockParameter({
      id: "test-param",
      type: "string/=",
      slug: "text",
      name: "Text",
    }),
    fields: [],
    ...parameter,
  };

  const setValue = jest.fn();

  renderWithProviders(
    <ParameterValueWidget
      parameter={defaultParameter}
      setValue={setValue}
      value={null}
      placeholder="Enter a value"
    />,
  );

  return { setValue };
}

type WidgetValue = ParameterValueOrArray | null;

interface StatefulSetupOpts {
  parameter: Partial<UiParameter>;
  value?: WidgetValue;
  cardId?: CardId;
}

const FILTER_NAME = "Filter";
const PARAMETER_ID = "param";

function setupStateful({ parameter, value = null, cardId }: StatefulSetupOpts) {
  const uiParameter: UiParameter = {
    ...createMockParameter({
      id: PARAMETER_ID,
      slug: "filter",
      name: FILTER_NAME,
    }),
    hasVariableTemplateTagTarget: true,
    ...parameter,
  };

  const StatefulWidget = () => {
    const [currentValue, setCurrentValue] = useState<WidgetValue>(value);

    return (
      <ParameterValueWidget
        parameter={uiParameter}
        value={currentValue}
        setValue={setCurrentValue}
        setParameterValueToDefault={() =>
          setCurrentValue(uiParameter.default ?? null)
        }
        placeholder={FILTER_NAME}
        cardId={cardId}
        enableRequiredBehavior
      />
    );
  };

  renderWithProviders(<StatefulWidget />);
}

type WidgetStatus = "clear" | "reset" | "chevron" | "none";

function getWidgetStatus(): WidgetStatus | undefined {
  const statuses: WidgetStatus[] = [
    screen.queryByRole("button", { name: "Clear" }) && "clear",
    screen.queryByRole("button", { name: "Reset filter to default state" }) &&
      "reset",
    screen.queryByLabelText("chevrondown icon") && "chevron",
    screen.queryByLabelText("empty icon") && "none",
  ].filter((status): status is WidgetStatus => Boolean(status));

  return statuses.length === 1 ? statuses[0] : undefined;
}

const TEXT_PARAMETER: Partial<UiParameter> = { type: "category" };
const DATE_PARAMETER: Partial<UiParameter> = { type: "date/single" };

describe("ParameterValueWidget", () => {
  it("should let a number filter be typed into when its field has no values to list", async () => {
    setup({
      parameter: {
        ...createMockParameter({
          id: "number-param",
          type: "number/=",
          sectionId: "number",
          slug: "number",
          name: "Number Equals",
        }),
        fields: [createProductsRatingField({ has_field_values: "none" })],
      },
    });

    await userEvent.click(screen.getByTestId("parameter-value-widget-target"));

    expect(
      await screen.findByPlaceholderText("Enter a number"),
    ).toBeInTheDocument();
  });

  it("should apply aria-expanded=true on the trigger button element (#70543)", async () => {
    setup();

    const triggerButton = screen.getByTestId("parameter-value-widget-target");

    // The trigger should be a button element (rendered via UnstyledButton when hasPopover is true)
    expect(triggerButton.tagName).toBe("BUTTON");

    // Before opening, aria-expanded should be false
    expect(triggerButton).toHaveAttribute("aria-expanded", "false");

    // Open the popover
    await userEvent.click(triggerButton);

    // After opening, aria-expanded should be true on the same button
    expect(triggerButton).toHaveAttribute("aria-expanded", "true");
  });

  describe("static list source with custom labels in a saved question", () => {
    const CARD_ID = 1;
    const LABELED_VALUE = "1018947080336";
    const LABEL = "Custom Label";
    const PLAIN_VALUE = "7663515285824";
    const VALUES: ParameterValues["values"] = [
      [LABELED_VALUE, LABEL],
      [PLAIN_VALUE],
    ];

    function setupStaticList({ queryType }: { queryType: ValuesQueryType }) {
      setupCardParameterValuesEndpoint({
        cardId: CARD_ID,
        parameterId: PARAMETER_ID,
        parameterValues: { values: VALUES, has_more_values: false },
      });
      setupCardParameterRemappingEndpoint({
        cardId: CARD_ID,
        parameterId: PARAMETER_ID,
        remappings: VALUES,
      });
      setupStateful({
        cardId: CARD_ID,
        parameter: {
          type: "string/=",
          hasVariableTemplateTagTarget: false,
          values_query_type: queryType,
          values_source_type: "static-list",
          values_source_config: { values: VALUES },
        },
      });
    }

    it("should show labels instead of values in the dropdown list", async () => {
      setupStaticList({ queryType: "list" });

      await userEvent.click(screen.getByRole("button", { name: FILTER_NAME }));
      const dropdown = await screen.findByTestId("parameter-value-dropdown");
      expect(await within(dropdown).findByText(LABEL)).toBeInTheDocument();
      expect(within(dropdown).getByText(PLAIN_VALUE)).toBeInTheDocument();
      expect(
        within(dropdown).queryByText(LABELED_VALUE),
      ).not.toBeInTheDocument();

      await userEvent.click(within(dropdown).getByText(LABEL));
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );

      expect(
        screen.getByRole("button", { name: FILTER_NAME }),
      ).toHaveTextContent(LABEL);
    });

    it("should show labels for search results in the search box", async () => {
      setupStaticList({ queryType: "search" });
      setupCardParameterSearchEndpoint({
        cardId: CARD_ID,
        parameterId: PARAMETER_ID,
        query: "Custom",
        parameterValues: {
          values: [[LABELED_VALUE, LABEL]],
          has_more_values: false,
        },
      });

      await userEvent.click(screen.getByRole("button", { name: FILTER_NAME }));
      const dropdown = await screen.findByTestId("parameter-value-dropdown");
      await userEvent.type(within(dropdown).getByRole("combobox"), "Custom");

      const option = await screen.findByRole("option", { name: LABEL });
      expect(
        screen.queryByRole("option", { name: LABELED_VALUE }),
      ).not.toBeInTheDocument();

      await userEvent.click(option);
      await userEvent.click(
        within(dropdown).getByRole("button", { name: "Add filter" }),
      );

      expect(
        screen.getByRole("button", { name: FILTER_NAME }),
      ).toHaveTextContent(LABEL);
    });
  });

  describe("clear and reset status", () => {
    describe.each([
      {
        widget: "input",
        parameter: TEXT_PARAMETER,
        defaultValue: "a",
        otherValue: "b",
        emptyStatus: "none",
      },
      {
        widget: "dropdown",
        parameter: DATE_PARAMETER,
        defaultValue: "2027-01-01",
        otherValue: "2020-01-01",
        emptyStatus: "chevron",
      },
    ] as const)(
      "$widget widget",
      ({ parameter, defaultValue, otherValue, emptyStatus }) => {
        it.each([
          {
            name: "no default, not required, no value",
            required: false,
            hasDefault: false,
            value: null,
            status: emptyStatus,
          },
          {
            name: "no default, not required, has value",
            required: false,
            hasDefault: false,
            value: otherValue,
            status: "clear",
          },
          {
            name: "no default, required, no value",
            required: true,
            hasDefault: false,
            value: null,
            status: "none",
          },
          {
            name: "no default, required, has value",
            required: true,
            hasDefault: false,
            value: otherValue,
            status: "clear",
          },
          {
            name: "default, not required, value same as default",
            required: false,
            hasDefault: true,
            value: defaultValue,
            status: "clear",
          },
          {
            name: "default, not required, no value",
            required: false,
            hasDefault: true,
            value: null,
            status: "reset",
          },
          {
            name: "default, not required, value different from default",
            required: false,
            hasDefault: true,
            value: otherValue,
            status: "reset",
          },
          {
            name: "default, required, value same as default",
            required: true,
            hasDefault: true,
            value: defaultValue,
            status: "none",
          },
          {
            name: "default, required, value different from default",
            required: true,
            hasDefault: true,
            value: otherValue,
            status: "reset",
          },
        ] as const)(
          "$name → $status",
          ({ required, hasDefault, value, status }) => {
            setupStateful({
              parameter: {
                ...parameter,
                required,
                default: hasDefault ? defaultValue : undefined,
              },
              value,
            });

            expect(getWidgetStatus()).toBe(status);
          },
        );
      },
    );

    it("should clear the value of a filter without a default value", async () => {
      setupStateful({ parameter: TEXT_PARAMETER, value: "b" });

      await userEvent.click(screen.getByRole("button", { name: "Clear" }));

      expect(screen.getByRole("textbox")).toHaveValue("");
      expect(getWidgetStatus()).toBe("none");
    });

    it("should clear the default value of a non-required filter, then reset it", async () => {
      setupStateful({
        parameter: { ...TEXT_PARAMETER, default: "a" },
        value: "a",
      });

      await userEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(screen.getByRole("textbox")).toHaveValue("");
      expect(getWidgetStatus()).toBe("reset");

      await userEvent.click(
        screen.getByRole("button", { name: "Reset filter to default state" }),
      );
      expect(screen.getByRole("textbox")).toHaveValue("a");
      expect(getWidgetStatus()).toBe("clear");
    });

    it("should reset a required filter to its default value", async () => {
      setupStateful({
        parameter: { ...TEXT_PARAMETER, required: true, default: "a" },
        value: "a",
      });

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "bc");
      await userEvent.tab();
      expect(input).toHaveValue("abc");
      expect(getWidgetStatus()).toBe("reset");

      await userEvent.click(
        screen.getByRole("button", { name: "Reset filter to default state" }),
      );
      expect(input).toHaveValue("a");
      expect(getWidgetStatus()).toBe("none");
    });

    it("should restore the default value of a required filter on blur when the input is empty", async () => {
      setupStateful({
        parameter: { ...TEXT_PARAMETER, required: true, default: "a" },
        value: null,
      });

      const input = screen.getByRole("textbox");
      await userEvent.click(input);
      await userEvent.tab();

      expect(input).toHaveValue("a");
      expect(getWidgetStatus()).toBe("none");
    });
  });
});
