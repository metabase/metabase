import { render } from "@testing-library/react";

import { NativeQueryEditor } from "./NativeQueryEditor";

describe("NativeQueryEditor composition API", () => {
  it("exposes the composable parts as static members", () => {
    expect(NativeQueryEditor.TopBar).toBeDefined();
    expect(NativeQueryEditor.Sidebar).toBeDefined();
    expect(NativeQueryEditor.ParametersList).toBeDefined();
    expect(NativeQueryEditor.VisibilityToggler).toBeDefined();
    expect(NativeQueryEditor.RunButton).toBeDefined();
  });

  it.each([
    ["TopBar", NativeQueryEditor.TopBar],
    ["Sidebar", NativeQueryEditor.Sidebar],
    ["ParametersList", NativeQueryEditor.ParametersList],
    ["VisibilityToggler", NativeQueryEditor.VisibilityToggler],
    ["RunButton", NativeQueryEditor.RunButton],
  ])("throws when %s is rendered outside the editor", (_name, Part) => {
    // Suppress React's error boundary logging for the expected throw.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => render(<Part />)).toThrow(
      /must be rendered inside <NativeQueryEditor>/,
    );

    consoleError.mockRestore();
  });
});
