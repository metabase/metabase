import { renderWithProviders, screen } from "__support__/ui";
import { CreatedAtContent } from "./CreatedAtContent";

type SetupProps = {
  value?: string;
};

const setup = ({ value = undefined }: SetupProps = {}) => {
  const onChangeMock = jest.fn();
  renderWithProviders(
    <CreatedAtContent value={value} onChange={onChangeMock} />,
  );
  return {
    onChangeMock,
  };
};

describe("CreatedAtContent", () => {
  it("should render CreatedAtContent component", () => {
    setup();
    expect(screen.getByTestId("date-picker")).toBeInTheDocument();
  });

  it("should not display Exclude… in the date picker shortcut options", () => {
    setup();
    expect(screen.queryByText("Exclude…")).not.toBeInTheDocument();
  });
});
