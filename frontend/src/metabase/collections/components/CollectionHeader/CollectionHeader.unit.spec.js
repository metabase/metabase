import React from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "__support__/ui";
import Header from "./CollectionHeader";

const collection = {
  name: "Name",
};

it("should display collection name", () => {
  renderWithProviders(<Header collection={collection} />);

  screen.getByText(collection.name);
});

describe("description tooltip", () => {
  describe("should not be displayed", () => {
    it("if description is not received", () => {
      const { container } = renderWithProviders(
        <Header collection={collection} />,
      );
      expect(container.textContent).toEqual("Name");
    });
  });

  describe("should be displayed", () => {
    it("if description is received", () => {
      const description = "description";

      renderWithProviders(
        <Header collection={{ ...collection, description }} />,
      );

      screen.getByText(description);
    });
  });
});

describe("permissions link", () => {
  const ariaLabel = "lock icon";

  describe("should not be displayed", () => {
    it("if user is not admin", () => {
      renderWithProviders(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("for personal collections", () => {
      renderWithProviders(
        <Header
          isAdmin={true}
          collection={{ ...collection, personal_owner_id: 1 }}
        />,
      );

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("if a collection is a personal collection child", () => {
      renderWithProviders(
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
      renderWithProviders(<Header collection={collection} isAdmin={true} />);

      screen.getByLabelText(ariaLabel);
    });
  });
});

describe("link to add new collection items", () => {
  const ariaLabel = "add icon";

  describe("should not be displayed", () => {
    it("when no detail is passed in the collection to determine if user can change collection", () => {
      renderWithProviders(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });

    it("if user is not allowed to change collection", () => {
      renderWithProviders(
        <Header collection={{ ...collection, can_write: false }} />,
      );

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("if user is allowed to change collection", () => {
      renderWithProviders(
        <Header collection={{ ...collection, can_write: true }} />,
      );

      screen.getByLabelText(ariaLabel);
    });
  });
});

describe("link to add new collection items", () => {
  const ariaLabel = "add icon";

  describe("should not be displayed", () => {
    it("if user is not allowed to change collection", () => {
      renderWithProviders(<Header collection={collection} />);

      expect(screen.queryByLabelText(ariaLabel)).not.toBeInTheDocument();
    });
  });

  describe("should be displayed", () => {
    it("if user is allowed to change collection", () => {
      renderWithProviders(
        <Header collection={{ ...collection, can_write: true }} />,
      );

      screen.getByLabelText(ariaLabel);
    });
  });
});
