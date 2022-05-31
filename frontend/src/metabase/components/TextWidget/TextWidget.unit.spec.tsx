import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import TextWidget from "./TextWidget";

describe("TextWidget", () => {
  it("should render correctly", () => {
    render(
      <TextWidget
        value={"Hello, world!"}
        setValue={jest.fn()}
        focusChanged={jest.fn()}
      ></TextWidget>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Hello, world!");
  });

  it("should accept editing", () => {
    render(
      <TextWidget
        value={""}
        setValue={jest.fn()}
        focusChanged={jest.fn()}
      ></TextWidget>,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Toucan McBird" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("Toucan McBird");
  });
});
