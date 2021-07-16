import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import Header from "./Header";

const collection = {
  name: "Name",
};

it("should display collection name", () => {
  render(<Header collection={collection} />);

  screen.getByText(collection.name);
});

describe("description tooltip", () => {
  const ariaLabel = "info icon";

  it("should not be displayed if description is not received", () => {
    render(<Header collection={collection} />);

    expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
  });

  it("should be displayed if description is received", () => {
    const description = "description";

    render(<Header collection={{ ...collection, description }} />);

    screen.getByLabelText(ariaLabel);
  });
});
