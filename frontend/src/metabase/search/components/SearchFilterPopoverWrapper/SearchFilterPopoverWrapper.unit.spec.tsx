import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { SearchFilterPopoverWrapper } from "./SearchFilterPopoverWrapper";

type SetupProps = {
  isLoading?: boolean;
  onApply?: jest.Func;
};

const setup = ({ isLoading = false }: SetupProps = {}) => {
  const onApply = jest.fn();

  renderWithProviders(
    <SearchFilterPopoverWrapper isLoading={isLoading} onApply={onApply}>
      Children Content
    </SearchFilterPopoverWrapper>,
  );

  return {
    onApply,
  };
};
describe("SearchFilterPopoverWrapper", () => {
  it("should render loading spinner when isLoading is true", () => {
    setup({ isLoading: true });

    const loadingSpinner = screen.getByTestId("loading-spinner");
    expect(loadingSpinner).toBeInTheDocument();
  });

  it("should render children content when isLoading is false", () => {
    setup();

    const childrenContent = screen.getByText("Children Content");
    expect(childrenContent).toBeInTheDocument();
  });

  it('should call onApply when the "Apply" button is clicked', async () => {
    const { onApply } = setup();

    const applyButton = screen.getByText("Apply");
    await userEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
