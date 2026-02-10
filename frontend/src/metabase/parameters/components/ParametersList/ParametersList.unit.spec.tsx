import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockParameter } from "metabase-types/api/mocks";

import { ParametersList } from "./ParametersList";
import type { ParametersListProps } from "./types";

function setup(props: Partial<ParametersListProps> = {}) {
  const parameters = [
    createMockParameter({
      id: "1",
      name: "Parameter 1",
      slug: "parameter-1",
      type: "string/contains",
    }),
    createMockParameter({
      id: "2",
      name: "Parameter 2",
      slug: "parameter-2",
      type: "string/does-not-contain",
    }),
  ];
  renderWithProviders(<ParametersList parameters={parameters} {...props} />);
}

describe("ParametersList", () => {
  it("should render parameters", () => {
    setup();
    expect(screen.getByText("Parameter 1")).toBeInTheDocument();
    expect(screen.getByText("Parameter 2")).toBeInTheDocument();
  });

  it("should close the first parameter widget when the second parameter widget is clicked metabase #67672", async () => {
    setup({ isEditing: true });
    await userEvent.click(screen.getByText("Parameter 1"));
    expect(screen.getByText("Contains", { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Parameter 2"));
    expect(
      screen.getByText("Does not contain", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Contains", { exact: false }),
    ).not.toBeInTheDocument();
  });
});
