import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createNativeQuestion, popover, restore } from "e2e/support/helpers";
import type { TemplateTag } from "metabase-types/api";

type SectionId =
  | "no_default_non_required"
  | "no_default_required"
  | "default_non_required"
  | "default_required";

const { PRODUCTS } = SAMPLE_DATABASE;

const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";

// unlike required dashboard filter, required native filter doesn't need to have a default value
const NO_DEFAULT_REQUIRED = "no default value, required";

const DEFAULT_NON_REQUIRED = "default value, non-required";

const DEFAULT_REQUIRED = "default value, required";

describe("scenarios > filters > sql filters > reset & clear", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("text parameters", () => {
    createNativeQuestionWithParameters({
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "text",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "text",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "text",
        default: "a",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "text",
        required: true,
        default: "a",
      },
    });

    checkNativeParametersInput({
      defaultValueFormatted: "a",
      otherValue: "{backspace}b",
      otherValueFormatted: "b",
      setValue: (label, value) => {
        filterInput(label).focus().clear().type(value).blur();
      },
    });
  });

  it("number parameters", () => {
    createNativeQuestionWithParameters({
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "number",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "number",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "number",
        default: "1",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "number",
        required: true,
        default: "1",
      },
    });

    checkNativeParametersInput({
      defaultValueFormatted: "1",
      otherValue: "{backspace}2",
      otherValueFormatted: "2",
      setValue: (label, value) => {
        filterInput(label).focus().clear().type(value).blur();
      },
    });
  });

  it("date parameters", () => {
    createNativeQuestionWithParameters({
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "date",
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "date",
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "date",
        default: "2024-01-01",
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "date",
        required: true,
        default: "2024-01-01",
      },
    });

    checkNativeParametersDropdown({
      defaultValueFormatted: "January 1, 2024",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
      setValue: value => {
        addDateFilter(value);
      },
      updateValue: value => {
        updateDateFilter(value);
      },
    });

    checkParameterSidebarDefaultValueDate({
      defaultValueFormatted: "January 1, 2024",
      otherValue: "01/01/2020",
      otherValueFormatted: "January 1, 2020",
    });
  });

  it("field parameters", () => {
    createNativeQuestionWithParameters({
      no_default_non_required: {
        name: "no_default_non_required",
        "display-name": NO_DEFAULT_NON_REQUIRED,
        id: "fed1b918",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
      },
      no_default_required: {
        name: "no_default_required",
        "display-name": NO_DEFAULT_REQUIRED,
        id: "fed1b919",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        required: true,
      },
      default_non_required: {
        name: "default_non_required",
        "display-name": DEFAULT_NON_REQUIRED,
        id: "75d67d38",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        // @ts-expect-error - TODO: https://github.com/metabase/metabase/issues/46263
        default: ["Gizmo"],
      },
      default_required: {
        name: "default_required",
        "display-name": DEFAULT_REQUIRED,
        id: "60f12ac8",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "string/contains",
        options: { "case-sensitive": false },
        required: true,
        // @ts-expect-error - TODO: https://github.com/metabase/metabase/issues/46263
        default: ["Gizmo"],
      },
    });

    checkNativeParametersDropdown({
      defaultValueFormatted: "Gizmo",
      otherValue: "{backspace}Gadget",
      otherValueFormatted: "Gadget",
      setValue: value => {
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Add filter").click();
      },
      updateValue: value => {
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Update filter").click();
      },
    });

    checkParameterSidebarDefaultValueDropdown({
      defaultValueFormatted: "Gizmo",
      otherValue: "{backspace}Gadget",
      otherValueFormatted: "Gadget",
      setValue: value => {
        popover().findByRole("searchbox").clear().type(value).blur();
        popover().button("Add filter").click();
      },
    });
  });

  function createNativeQuestionWithParameters(
    templateTags: Record<SectionId, TemplateTag>,
  ) {
    createNativeQuestion(
      {
        native: {
          query:
            "select {{no_default_non_required}}, {{no_default_required}}, {{default_non_required}}, {{default_required}}",
          "template-tags": templateTags,
        },
      },
      { visitQuestion: true },
    );
  }

  function checkStatusIcon(
    label: string,
    /**
     * Use 'none' when no icon should be visible.
     */
    icon: "chevron" | "reset" | "clear" | "none",
  ) {
    clearIcon(label).should(icon === "clear" ? "be.visible" : "not.exist");
    resetIcon(label).should(icon === "reset" ? "be.visible" : "not.exist");
    chevronIcon(label).should(icon === "chevron" ? "be.visible" : "not.exist");
  }

  function checkNativeParametersInput({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: (label: string, value: string) => void;
    updateValue?: (label: string, value: string) => void;
  }) {
    cy.log("no default value, non-required, no current value");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "none");

    cy.log("no default value, non-required, has current value");
    setValue(NO_DEFAULT_NON_REQUIRED, otherValue);
    filterInput(NO_DEFAULT_NON_REQUIRED).should(
      "have.value",
      otherValueFormatted,
    );
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "clear");
    clearButton(NO_DEFAULT_NON_REQUIRED).click();
    filterInput(NO_DEFAULT_NON_REQUIRED).should("have.value", "");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "none");

    cy.log("no default value, required, no current value");
    checkStatusIcon(NO_DEFAULT_REQUIRED, "none");

    cy.log("no default value, required, has current value");
    updateValue(NO_DEFAULT_REQUIRED, otherValue);
    filterInput(NO_DEFAULT_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(NO_DEFAULT_REQUIRED, "clear");

    cy.log("has default value, non-required, current value same as default");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
    filterInput(DEFAULT_NON_REQUIRED).should(
      "have.value",
      defaultValueFormatted,
    );
    clearButton(DEFAULT_NON_REQUIRED).click();
    filterInput(DEFAULT_NON_REQUIRED).should("have.value", "");

    cy.log("has default value, non-required, no current value");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filterInput(DEFAULT_NON_REQUIRED).should(
      "have.value",
      defaultValueFormatted,
    );
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    updateValue(DEFAULT_NON_REQUIRED, otherValue);
    filterInput(DEFAULT_NON_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filterInput(DEFAULT_NON_REQUIRED).should(
      "have.value",
      defaultValueFormatted,
    );
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log("has default value, required, value same as default");
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    cy.log("has default value, required, current value different than default");
    updateValue(DEFAULT_REQUIRED, otherValue);
    filterInput(DEFAULT_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "reset");
    resetButton(DEFAULT_REQUIRED).click();
    filterInput(DEFAULT_REQUIRED).should("have.value", defaultValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    checkParameterSidebarDefaultValue({
      defaultValueFormatted,
      otherValue,
      otherValueFormatted,
      setValue,
      updateValue,
    });
  }

  function checkNativeParametersDropdown({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: (value: string) => void;
    updateValue?: (value: string) => void;
  }) {
    cy.log("no default value, non-required, no current value");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "chevron");

    cy.log("no default value, non-required, has current value");
    filter(NO_DEFAULT_NON_REQUIRED).click();
    setValue(otherValue);
    filter(NO_DEFAULT_NON_REQUIRED).should("have.text", otherValueFormatted);
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "clear");
    clearButton(NO_DEFAULT_NON_REQUIRED).click();
    filter(NO_DEFAULT_NON_REQUIRED).should(
      "have.text",
      NO_DEFAULT_NON_REQUIRED,
    );
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "chevron");

    cy.log("no default value, required, no current value");
    checkStatusIcon(NO_DEFAULT_REQUIRED, "none");

    cy.log("no default value, required, has current value");
    filter(NO_DEFAULT_REQUIRED).click();
    updateValue(otherValue);
    filter(NO_DEFAULT_REQUIRED).should("have.text", otherValueFormatted);
    // checkStatusIcon(NO_DEFAULT_REQUIRED, "clear");

    cy.log("has default value, non-required, current value same as default");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
    filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
    clearButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.text", DEFAULT_NON_REQUIRED);

    cy.log("has default value, non-required, no current value");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    filter(DEFAULT_NON_REQUIRED).click();
    updateValue(otherValue);
    filter(DEFAULT_NON_REQUIRED).should("have.text", otherValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log("has default value, required, value same as default");
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    cy.log("has default value, required, current value different than default");
    filter(DEFAULT_REQUIRED).click();
    updateValue(otherValue);
    filter(DEFAULT_REQUIRED).should("have.text", otherValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "reset");
    resetButton(DEFAULT_REQUIRED).click();
    filter(DEFAULT_REQUIRED).should("have.text", defaultValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "none");
  }

  function checkParameterSidebarDefaultValue<T = string>({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  }: {
    defaultValueFormatted: string;
    otherValue: T;
    otherValueFormatted: string;
    setValue: (label: string, value: T) => void;
    updateValue: (label: string, value: T) => void;
  }) {
    cy.log("parameter sidebar");

    cy.findByTestId("visibility-toggler").click();
    cy.icon("variable").click();

    cy.log(NO_DEFAULT_NON_REQUIRED);
    filterSection("no_default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "none");

      setValue("Default filter widget value", otherValue);
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "none");
    });

    cy.log(DEFAULT_NON_REQUIRED);
    filterSection("default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "none");

      setValue("Default filter widget value", otherValue);
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });

    cy.log(DEFAULT_REQUIRED);
    filterSection("default_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value (required)").should(
        "have.value",
        "",
      );
      checkStatusIcon("Default filter widget value (required)", "none");

      updateValue("Default filter widget value (required)", otherValue);
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });

    cy.log(NO_DEFAULT_REQUIRED);
    filterSection("no_default_required").within(() => {
      filter("Default filter widget value (required)").scrollIntoView();
      filterInput("Default filter widget value (required)").should(
        "have.value",
        "",
      );
      checkStatusIcon("Default filter widget value (required)", "none");

      updateValue("Default filter widget value (required)", otherValue);
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearButton("Default filter widget value").click();
      checkStatusIcon("Default filter widget value (required)", "none");
    });
  }

  function checkParameterSidebarDefaultValueDate({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
  }) {
    cy.log("parameter sidebar");

    cy.findByTestId("visibility-toggler").click();
    cy.icon("variable").click();

    cy.log(NO_DEFAULT_NON_REQUIRED);
    filterSection("no_default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "chevron");
      filter("Default filter widget value").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("no_default_non_required").within(() => {
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "chevron");
    });

    cy.log(NO_DEFAULT_REQUIRED);
    filterSection("no_default_required").within(() => {
      filter("Default filter widget value (required)").scrollIntoView();
      filterInput("Default filter widget value (required)").should(
        "have.value",
        "",
      );
      checkStatusIcon("Default filter widget value (required)", "chevron");
      filter("Default filter widget value (required)").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("no_default_required").within(() => {
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearButton("Default filter widget value").click();
      checkStatusIcon("Default filter widget value (required)", "chevron");
    });

    cy.log(DEFAULT_NON_REQUIRED);
    filterSection("default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value").should("have.value", "");
      checkStatusIcon("Default filter widget value", "chevron");
      filter("Default filter widget value").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("default_non_required").within(() => {
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });

    cy.log(DEFAULT_REQUIRED);
    filterSection("default_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filterInput("Default filter widget value").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filterInput("Default filter widget value (required)").should(
        "have.value",
        "",
      );
      checkStatusIcon("Default filter widget value (required)", "chevron");
      filter("Default filter widget value (required)").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("default_required").within(() => {
      filterInput("Default filter widget value").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });
  }

  function checkParameterSidebarDefaultValueDropdown({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: (value: string) => void;
    updateValue?: (value: string) => void;
  }) {
    cy.log("parameter sidebar");

    cy.findByTestId("visibility-toggler").click();
    cy.icon("variable").click();

    cy.log(NO_DEFAULT_NON_REQUIRED);
    filterSection("no_default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filter("Default filter widget value").should(
        "have.text",
        "Enter a default value…",
      );
      checkStatusIcon("Default filter widget value", "chevron");
      filter("Default filter widget value").click();
    });

    setValue(otherValue);

    filterSection("no_default_non_required").within(() => {
      filter("Default filter widget value").should(
        "have.text",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filter("Default filter widget value").should(
        "have.text",
        "Enter a default value…",
      );
      checkStatusIcon("Default filter widget value", "chevron");
    });

    cy.log(NO_DEFAULT_REQUIRED);
    filterSection("no_default_required").within(() => {
      filter("Default filter widget value (required)").scrollIntoView();
      filter("Default filter widget value (required)").should(
        "have.text",
        "Enter a default value…",
      );
      checkStatusIcon("Default filter widget value (required)", "chevron");
      filter("Default filter widget value (required)").click();
    });

    setValue(otherValue);

    filterSection("no_default_required").within(() => {
      filter("Default filter widget value").should(
        "have.text",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearButton("Default filter widget value").click();
      checkStatusIcon("Default filter widget value (required)", "chevron");
    });

    cy.log(DEFAULT_NON_REQUIRED);
    filterSection("default_non_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filter("Default filter widget value").should(
        "have.text",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filter("Default filter widget value").should(
        "have.text",
        "Enter a default value…",
      );
      checkStatusIcon("Default filter widget value", "chevron");
      filter("Default filter widget value").click();
    });

    setValue(otherValue);

    filterSection("default_non_required").within(() => {
      filter("Default filter widget value").should(
        "have.text",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });

    cy.log(DEFAULT_REQUIRED);
    filterSection("default_required").within(() => {
      filter("Default filter widget value").scrollIntoView();
      filter("Default filter widget value").should(
        "have.text",
        defaultValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");

      clearIcon("Default filter widget value").click();
      filter("Default filter widget value (required)").should(
        "have.text",
        "Enter a default value…",
      );
      checkStatusIcon("Default filter widget value (required)", "chevron");
      filter("Default filter widget value (required)").click();
    });

    updateValue(otherValue);

    filterSection("default_required").within(() => {
      filter("Default filter widget value").should(
        "have.text",
        otherValueFormatted,
      );
      checkStatusIcon("Default filter widget value", "clear");
    });
  }

  function filter(label: string) {
    return cy.findByLabelText(label);
  }

  function filterInput(label: string) {
    return filter(label).findByRole("textbox");
  }

  function filterSection(id: SectionId) {
    return cy.findByTestId(`tag-editor-variable-${id}`);
  }

  function clearIcon(label: string) {
    return filter(label).parent().icon("close");
  }

  function resetIcon(label: string) {
    return filter(label).parent().icon("revert");
  }

  function clearButton(label: string) {
    return filter(label).parent().findByLabelText("Clear");
  }

  function resetButton(label: string) {
    return filter(label)
      .parent()
      .findByLabelText("Reset filter to default state");
  }

  function chevronIcon(label: string) {
    return filter(label).parent().icon("chevrondown");
  }

  function addDateFilter(value: string) {
    popover().findByRole("textbox").clear().type(value).blur();
    popover().button("Add filter").click();
  }

  function updateDateFilter(value: string) {
    popover().findByRole("textbox").clear().type(value).blur();
    popover().button("Update filter").click();
  }
});
