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

describe("permissions link", () => {
  const ariaLabel = "lock icon";

  describe("should not be displayed", () => {
    it("when isAdmin is not passed", () => {
      render(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("when collection includes personal_owner_id", () => {
      render(
        <Header
          isAdmin={true}
          collection={{ ...collection, personal_owner_id: 1 }}
        />,
      );

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("when isPersonalCollectionChild is truthy", () => {
      render(
        <Header
          isAdmin={true}
          collection={collection}
          isPersonalCollectionChild={true}
        />,
      );

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("when user is admin, collection does not include personal_owner_id and isPersonalCollectionChild is falsey", () => {
      render(
        <Header
          collection={collection}
          isAdmin={true}
          isPersonalCollectionChild={false}
        />,
      );

      screen.getByLabelText(ariaLabel);
    });
  });
});
