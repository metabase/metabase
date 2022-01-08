import React from "react";
import GoogleButton from "./GoogleButton";
import { act, render, screen } from "@testing-library/react";

describe("GoogleButton", () => {
  it("should login successfully", async () => {
    const token = "oauth";
    const redirectUrl = "/url";
    const onAttach = jest.fn();
    const onLogin = jest.fn().mockResolvedValue({});

    render(
      <GoogleButton
        redirectUrl={redirectUrl}
        onAttach={onAttach}
        onLogin={onLogin}
      />,
    );
    await act(() => onAttach.mock.calls[0][1](token));

    expect(onLogin).toHaveBeenCalledWith(token, redirectUrl);
  });

  it("should render api errors", async () => {
    const token = "oauth";
    const errors = { data: { errors: { token: "Invalid token" } } };
    const onAttach = jest.fn();
    const onLogin = jest.fn().mockRejectedValue(errors);

    render(<GoogleButton onAttach={onAttach} onLogin={onLogin} />);
    await act(() => onAttach.mock.calls[0][1](token));

    expect(screen.getByText("Invalid token")).toBeInTheDocument();
  });

  it("should render auth errors", async () => {
    const onAttach = jest.fn();
    const onLogin = jest.fn();

    render(<GoogleButton onAttach={onAttach} onLogin={onLogin} />);
    await act(() => onAttach.mock.calls[0][2]("Window closed"));

    expect(screen.getByText("Window closed")).toBeInTheDocument();
  });
});
