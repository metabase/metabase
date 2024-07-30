import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createNativeQuestion, popover, restore } from "e2e/support/helpers";
import type { TemplateTag } from "metabase-types/api";

const { PRODUCTS } = SAMPLE_DATABASE;

const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";

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
      setValue: (labelOrPlaceholder, value) => {
        filter(labelOrPlaceholder).focus().clear().type(value).blur();
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
      setValue: (labelOrPlaceholder, value) => {
        filter(labelOrPlaceholder).focus().clear().type(value).blur();
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
    templateTags: Record<
      // TODO: case 4 - ? empty required
      "no_default_non_required" | "default_non_required" | "default_required",
      TemplateTag
    >,
  ) {
    createNativeQuestion(
      {
        native: {
          query:
            "select {{no_default_non_required}}, {{default_non_required}}, {{default_required}}",
          "template-tags": templateTags,
        },
      },
      { visitQuestion: true },
    );
  }

  function checkStatusIcon(
    labelOrPlaceholder: string,
    /**
     * Use 'none' when no icon should be visible.
     */
    icon: "chevron" | "reset" | "clear" | "none",
  ) {
    clearIcon(labelOrPlaceholder).should(
      icon === "clear" ? "be.visible" : "not.exist",
    );
    resetIcon(labelOrPlaceholder).should(
      icon === "reset" ? "be.visible" : "not.exist",
    );
    chevronIcon(labelOrPlaceholder).should(
      icon === "chevron" ? "be.visible" : "not.exist",
    );
  }

  function checkNativeParametersInput<T = string>({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
  }: {
    defaultValueFormatted: string;
    otherValue: T;
    otherValueFormatted: string;
    setValue: (labelOrPlaceholder: string, value: T) => void;
    updateValue?: (labelOrPlaceholder: string, value: T) => void;
  }) {
    cy.log("no default value, non-required, no current value");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "none");

    cy.log("no default value, non-required, has current value");
    setValue(NO_DEFAULT_NON_REQUIRED, otherValue);
    filter(NO_DEFAULT_NON_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "clear");
    clearButton(NO_DEFAULT_NON_REQUIRED).click();
    filter(NO_DEFAULT_NON_REQUIRED).should("have.value", "");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "none");

    cy.log("has default value, non-required, current value same as default");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");
    filter(DEFAULT_NON_REQUIRED).should("have.value", defaultValueFormatted);
    clearButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.value", "");

    cy.log("has default value, non-required, no current value");
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.value", defaultValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log(
      "has default value, non-required, current value different than default",
    );
    updateValue(DEFAULT_NON_REQUIRED, otherValue);
    filter(DEFAULT_NON_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.value", defaultValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log("has default value, required, value same as default");
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    cy.log("has default value, required, current value different than default");
    updateValue(DEFAULT_REQUIRED, otherValue);
    filter(DEFAULT_REQUIRED).should("have.value", otherValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "reset");
    resetButton(DEFAULT_REQUIRED).click();
    filter(DEFAULT_REQUIRED).should("have.value", defaultValueFormatted);
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
    setValue: (labelOrPlaceholder: string, value: T) => void;
    updateValue: (labelOrPlaceholder: string, value: T) => void;
  }) {
    cy.log("parameter sidebar");

    cy.findByTestId("visibility-toggler").click();
    cy.icon("variable").click();

    cy.log(NO_DEFAULT_NON_REQUIRED);
    filterSection("no_default_non_required").within(() => {
      filter("Enter a default value…").scrollIntoView();
      filter("Enter a default value…").should("have.value", "");
      checkStatusIcon("Enter a default value…", "none");

      setValue("Enter a default value…", otherValue);
      filter("Enter a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Enter a default value…", "clear");

      clearIcon("Enter a default value…").click();
      filter("Enter a default value…").should("have.value", "");
      checkStatusIcon("Enter a default value…", "none");
    });

    cy.log(DEFAULT_NON_REQUIRED);
    filterSection("default_non_required").within(() => {
      filter("Enter a default value…").scrollIntoView();
      filter("Enter a default value…").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Enter a default value…", "clear");

      clearIcon("Enter a default value…").click();
      filter("Enter a default value…").should("have.value", "");
      checkStatusIcon("Enter a default value…", "none");

      setValue("Enter a default value…", otherValue);
      filter("Enter a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Enter a default value…", "clear");
    });

    cy.log(DEFAULT_REQUIRED);
    filterSection("default_required").within(() => {
      filter("Enter a default value…").scrollIntoView();
      filter("Enter a default value…").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Enter a default value…", "clear");

      clearIcon("Enter a default value…").click();
      filter("Enter a default value…").should("have.value", "");
      checkStatusIcon("Enter a default value…", "none");

      updateValue("Enter a default value…", otherValue);
      filter("Enter a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Enter a default value…", "clear");
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
      filter("Select a default value…").scrollIntoView();
      filter("Select a default value…").should("have.value", "");
      checkStatusIcon("Select a default value…", "chevron");
      filter("Select a default value…").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("no_default_non_required").within(() => {
      filter("Select a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Select a default value…", "clear");

      clearIcon("Select a default value…").click();
      filter("Select a default value…").should("have.value", "");
      checkStatusIcon("Select a default value…", "chevron");
    });

    cy.log(DEFAULT_NON_REQUIRED);
    filterSection("default_non_required").within(() => {
      filter("Select a default value…").scrollIntoView();
      filter("Select a default value…").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Select a default value…", "clear");

      clearIcon("Select a default value…").click();
      filter("Select a default value…").should("have.value", "");
      checkStatusIcon("Select a default value…", "chevron");
      filter("Select a default value…").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("default_non_required").within(() => {
      filter("Select a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Select a default value…", "clear");
    });

    cy.log(DEFAULT_REQUIRED);
    filterSection("default_required").within(() => {
      filter("Select a default value…").scrollIntoView();
      filter("Select a default value…").should(
        "have.value",
        defaultValueFormatted,
      );
      checkStatusIcon("Select a default value…", "clear");

      clearIcon("Select a default value…").click();
      filter("Select a default value…").should("have.value", "");
      checkStatusIcon("Select a default value…", "chevron");
      filter("Select a default value…").click();
    });

    popover().findByRole("textbox").clear().type(otherValue).blur();
    popover().button("Add filter").click();

    filterSection("default_required").within(() => {
      filter("Select a default value…").should(
        "have.value",
        otherValueFormatted,
      );
      checkStatusIcon("Select a default value…", "clear");
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

  function filter(labelOrPlaceholder: string) {
    // simple filters (text/number) can be found by placeholders
    // date filters can be found by labels
    return cy.findByLabelText(labelOrPlaceholder);
    // return cy.findAllByLabelText(labelOrPlaceholder);
    // return cy.get(
    //   `[placeholder="${labelOrPlaceholder}"],[aria-label="${labelOrPlaceholder}"]`,
    // );
  }

  function filterSection(id: string) {
    return cy.findByTestId(`tag-editor-variable-${id}`);
  }

  function clearIcon(labelOrPlaceholder: string) {
    return filter(labelOrPlaceholder).parent().icon("close");
  }

  function resetIcon(labelOrPlaceholder: string) {
    return filter(labelOrPlaceholder).parent().icon("revert");
  }

  function clearButton(labelOrPlaceholder: string) {
    return filter(labelOrPlaceholder).parent().findByLabelText("Clear");
  }

  function resetButton(labelOrPlaceholder: string) {
    return filter(labelOrPlaceholder)
      .parent()
      .findByLabelText("Reset filter to default state");
  }

  function chevronIcon(labelOrPlaceholder: string) {
    return filter(labelOrPlaceholder).parent().icon("chevrondown");
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
