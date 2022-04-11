import React from "react";
import { render } from "@testing-library/react";
import SSOButton from "./SSOButton";

describe("SSOButton", () => {
  it("should login immediately when embedded", () => {
    const onLogin = jest.fn();

    render(<SSOButton isEmbedded={true} onLogin={onLogin} />);

    expect(onLogin).toHaveBeenCalled();
  });
});
