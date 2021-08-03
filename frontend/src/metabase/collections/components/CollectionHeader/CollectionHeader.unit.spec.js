import React from "react";
import { render, screen } from "@testing-library/react";

import Header from "./CollectionHeader";

const collection = {
  name: "Name",
};

it("should display collection name", () => {
  render(<Header collection={collection} />);

  screen.getByText(collection.name);
});

describe("description tooltip", () => {
  const ariaLabel = "info icon";

  describe("should not be displayed", () => {
    it("if description is not received", () => {
      render(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("if description is received", () => {
      const description = "description";

      render(<Header collection={{ ...collection, description }} />);

      screen.getByLabelText(ariaLabel);
    });
  });
});

describe("permissions link", () => {
  const ariaLabel = "lock icon";

  describe("should not be displayed", () => {
    it("if user is not admin", () => {
      render(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("for personal collections", () => {
      render(
        <Header
          isAdmin={true}
          collection={{ ...collection, personal_owner_id: 1 }}
        />,
      );

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("if a collection is a personal collection child", () => {
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
    it("if user is admin", () => {
      render(<Header collection={collection} isAdmin={true} />);

      screen.getByLabelText(ariaLabel);
    });
  });
});

describe("link to edit collection", () => {
  const ariaLabel = "pencil icon";

  describe("should not be displayed", () => {
    it("when no detail is passed in the collection to determine if user can change collection", () => {
      render(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("if user is not allowed to change collection", () => {
      render(<Header collection={{ ...collection, can_write: false }} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("if user is allowed to change collection", () => {
      render(<Header collection={{ ...collection, can_write: true }} />);

      screen.getByLabelText(ariaLabel);
    });
  });
});

describe("link to create a new collection", () => {
  const ariaLabel = "new_folder icon";

  describe("should not be displayed", () => {
    it("if user is not allowed to change collection", () => {
      render(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("if user is allowed to change collection", () => {
      render(<Header collection={{ ...collection, can_write: true }} />);

      screen.getByLabelText(ariaLabel);
    });
  });
});
