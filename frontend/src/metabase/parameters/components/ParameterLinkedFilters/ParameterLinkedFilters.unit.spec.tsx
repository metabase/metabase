import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { UiParameter } from "metabase-lib/parameters/types";
import { createMockUiParameter } from "metabase-lib/parameters/mock";
import ParameterLinkedFilters from "./ParameterLinkedFilters";

interface SetupOpts {
  parameter: UiParameter;
  otherParameters: UiParameter[];
}

const setup = ({ parameter, otherParameters }: SetupOpts) => {
  const onChangeFilteringParameters = jest.fn();
  const onShowAddParameterPopover = jest.fn();

  renderWithProviders(
    <ParameterLinkedFilters
      parameter={parameter}
      otherParameters={otherParameters}
      onChangeFilteringParameters={onChangeFilteringParameters}
      onShowAddParameterPopover={onShowAddParameterPopover}
    />,
  );

  return { onChangeFilteringParameters, onShowAddParameterPopover };
};

describe("ParameterLinkedFilters", () => {
  it("should toggle filtering parameters", () => {
    const { onChangeFilteringParameters } = setup({
      parameter: createMockUiParameter({
        id: "p1",
        name: "P1",
      }),
      otherParameters: [
        createMockUiParameter({
          id: "p2",
          name: "P2",
        }),
      ],
    });

    userEvent.click(screen.getByRole("switch"));

    expect(onChangeFilteringParameters).toHaveBeenCalledWith(["p2"]);
  });
});
