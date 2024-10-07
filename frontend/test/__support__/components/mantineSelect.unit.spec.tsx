import { render, screen } from "__support__/ui";
import { Select } from "metabase/ui";

import { getMantineSelectOptions } from "./mantineSelect";

describe("getMantineSelectOptions", () => {
  it("fetches options from the <Select> component", async () => {
    render(
      <Select
        value="option2"
        data={[
          { value: "option1", label: "Option 1" },
          { value: "option2", label: "Option 2" },
          { value: "option3", label: "Option 3" },
        ]}
      />,
    );
    const { optionElements, optionTextContents, displayedOption } =
      await getMantineSelectOptions();

    expect(optionElements.length).toBe(3);
    expect(optionElements[0]).toHaveTextContent("Option 1");
    expect(optionElements[1]).toHaveTextContent("Option 2");
    expect(optionElements[2]).toHaveTextContent("Option 3");
    expect(optionTextContents).toEqual(["Option 1", "Option 2", "Option 3"]);
    expect(displayedOption.value).toBe("Option 2");
  });

  it("fetches options from the <Select> component within a provided element", async () => {
    render(
      <>
        <Select
          value="select1-option2"
          data={[
            { value: "select1-option1", label: "First Select, option 1" },
            { value: "select1-option2", label: "First Select, option 2" },
            { value: "select1-option3", label: "First Select, option 3" },
          ]}
        />
        <div data-testid="second-select-container">
          <Select
            value="select2-option2"
            data={[
              {
                value: "select2-option1",
                label: "Second Select, option 1",
              },
              {
                value: "select2-option2",
                label: "Second Select, option 2",
              },
              {
                value: "select2-option3",
                label: "Second Select, option 3",
              },
            ]}
          />
        </div>
      </>,
    );
    const secondSelectContainer = await screen.findByTestId(
      "second-select-container",
    );
    const { optionElements, optionTextContents, displayedOption } =
      await getMantineSelectOptions({
        within: secondSelectContainer,
      });

    expect(optionElements.length).toBe(3);
    expect(optionTextContents).toContain("Second Select, option 1");
    expect(optionTextContents).toContain("Second Select, option 2");
    expect(optionTextContents).toContain("Second Select, option 3");
    expect(displayedOption.value).toBe("Second Select, option 2");
  });

  it("throws an error if the <Select> is not found", async () => {
    await expect(getMantineSelectOptions()).rejects.toThrow(
      /Unable to find.*role="combobox"/,
    );
  });
});
