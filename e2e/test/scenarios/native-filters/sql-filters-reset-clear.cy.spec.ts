import { createNativeQuestion, popover, restore } from "e2e/support/helpers";
import type { TemplateTag } from "metabase-types/api";

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
      setValue: (label, value) => {
        filter(label).focus().clear().type(value).blur();
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
      setValue: (label, value) => {
        filter(label).focus().clear().type(value).blur();
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
      setValue: (label, value) => {
        addDateFilter(label, value);
      },
      updateValue: (label, value) => {
        updateDateFilter(label, value);
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
    setValue: (label: string, value: T) => void;
    updateValue?: (label: string, value: T) => void;
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
    setValue: (label: string, value: string) => void;
    updateValue?: (label: string, value: string) => void;
  }) {
    cy.log("no default value, non-required, no current value");
    checkStatusIcon(NO_DEFAULT_NON_REQUIRED, "chevron");

    cy.log("no default value, non-required, has current value");
    setValue(NO_DEFAULT_NON_REQUIRED, otherValue);
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
    updateValue(DEFAULT_NON_REQUIRED, otherValue);
    filter(DEFAULT_NON_REQUIRED).should("have.text", otherValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "reset");
    resetButton(DEFAULT_NON_REQUIRED).click();
    filter(DEFAULT_NON_REQUIRED).should("have.text", defaultValueFormatted);
    checkStatusIcon(DEFAULT_NON_REQUIRED, "clear");

    cy.log("has default value, required, value same as default");
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    cy.log("has default value, required, current value different than default");
    updateValue(DEFAULT_REQUIRED, otherValue);
    filter(DEFAULT_REQUIRED).should("have.text", otherValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "reset");
    resetButton(DEFAULT_REQUIRED).click();
    filter(DEFAULT_REQUIRED).should("have.text", defaultValueFormatted);
    checkStatusIcon(DEFAULT_REQUIRED, "none");

    checkParameterSidebarDateDefaultValue({
      defaultValueFormatted,
      otherValue,
      otherValueFormatted,
      setValue,
      updateValue,
    });
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

  function checkParameterSidebarDateDefaultValue({
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  }: {
    defaultValueFormatted: string;
    otherValue: string;
    otherValueFormatted: string;
    setValue: (label: string, value: string) => void;
    updateValue: (label: string, value: string) => void;
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

  function filter(labelOrPlaceholder: string) {
    // simple filters (text/number) can be found by placeholders
    // date filters can be found by labels
    return cy.get(
      `[placeholder="${labelOrPlaceholder}"],[aria-label="${labelOrPlaceholder}"]`,
    );
  }

  function filterSection(id: string) {
    return cy.findByTestId(`tag-editor-variable-${id}`);
  }

  function clearIcon(placeholder: string) {
    return filter(placeholder).parent().icon("close");
  }

  function resetIcon(placeholder: string) {
    return filter(placeholder).parent().icon("revert");
  }

  function clearButton(placeholder: string) {
    return filter(placeholder).parent().findByLabelText("Clear");
  }

  function resetButton(placeholder: string) {
    return filter(placeholder)
      .parent()
      .findByLabelText("Reset filter to default state");
  }

  function chevronIcon(placeholder: string) {
    return filter(placeholder).parent().icon("chevrondown");
  }

  function addDateFilter(placeholder: string, value: string) {
    filter(placeholder).click();
    popover().findByRole("textbox").clear().type(value).blur();
    popover().button("Add filter").click();
  }

  function updateDateFilter(placeholder: string, value: string) {
    filter(placeholder).click();
    popover().findByRole("textbox").clear().type(value).blur();
    popover().button("Update filter").click();
  }

  function addRangeFilter(
    placeholder: string,
    firstValue: string,
    secondValue: string,
  ) {
    filter(placeholder).click();
    popover().findAllByRole("textbox").first().clear().type(firstValue).blur();
    popover().findAllByRole("textbox").last().clear().type(secondValue).blur();
    popover().button("Add filter").click();
  }

  function updateRangeFilter(
    placeholder: string,
    firstValue: string,
    secondValue: string,
  ) {
    filter(placeholder).click();
    popover().findAllByRole("textbox").first().clear().type(firstValue).blur();
    popover().findAllByRole("textbox").last().clear().type(secondValue).blur();
    popover().button("Update filter").click();
  }
});
