/* eslint-disable react/prop-types */
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { VerifiedFilterDisplay } from "metabase-enterprise/content_verification/VerifiedFilter/VerifiedFilterDisplay";
import type {
  VerifiedFilterProps,
  SearchFilterToggle,
} from "metabase/search/types";

const TestVerifiedFilterDisplay: SearchFilterToggle<"verified">["Component"] =
  ({ value, onChange }) => {
    const [isVerified, setIsVerified] = useState<VerifiedFilterProps>(value);

    const onFilterChange = (val: VerifiedFilterProps) => {
      setIsVerified(val);
      onChange(val);
    };

    return (
      <VerifiedFilterDisplay value={isVerified} onChange={onFilterChange} />
    );
  };

const setup = ({
  value = undefined,
}: {
  value?: VerifiedFilterProps;
} = {}) => {
  const onChangeMock = jest.fn();
  renderWithProviders(
    <TestVerifiedFilterDisplay value={value} onChange={onChangeMock} />,
  );
  return {
    onChangeMock,
  };
};

describe("VerifiedFilterDisplay", () => {
  it("should render with untoggled state when value is undefined", () => {
    setup({ value: undefined });

    const switchElement = screen.getByRole("checkbox");

    expect(switchElement).toBeInTheDocument();
    expect(switchElement).not.toBeChecked();
  });

  it("should render with toggled state when value is true", () => {
    setup({ value: true });

    const switchElement = screen.getByRole("checkbox");

    expect(switchElement).toBeInTheDocument();
    expect(switchElement).toBeChecked();
  });

  it("should only call the onChange function with true and undefined", () => {
    const { onChangeMock } = setup();

    const switchElement = screen.getByRole("checkbox");

    userEvent.click(switchElement);
    expect(onChangeMock).toHaveBeenCalledWith(true);

    userEvent.click(switchElement);
    expect(onChangeMock).toHaveBeenCalledWith(undefined);
  });
});
