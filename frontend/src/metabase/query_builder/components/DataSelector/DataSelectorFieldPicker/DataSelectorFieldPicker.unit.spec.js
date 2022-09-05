import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import DataSelectorFieldPicker from "./DataSelectorFieldPicker";

describe("DataSelectorFieldPicker", () => {
  describe("when loading", () => {
    it("uses 'Fields' as title if selectedTable not passed", () => {
      render(<DataSelectorFieldPicker isLoading={true} />);

      screen.getByText("Fields");
    });

    it("uses table display name as title if passed", () => {
      const displayName = "Display name";

      render(
        <DataSelectorFieldPicker
          isLoading={true}
          selectedTable={{ display_name: displayName }}
        />,
      );

      screen.getByText(displayName);
    });
  });

  it("goes back if clicked", () => {
    const onBack = jest.fn();

    render(<DataSelectorFieldPicker isLoading={true} onBack={onBack} />);

    fireEvent.click(screen.getByText("Fields"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
