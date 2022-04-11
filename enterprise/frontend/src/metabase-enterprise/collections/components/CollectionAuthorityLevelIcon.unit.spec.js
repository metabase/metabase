import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionAuthorityLevelIcon } from "./CollectionAuthorityLevelIcon";

describe("CollectionAuthorityLevelIcon", () => {
  describe("regular collections", () => {
    [
      {
        name: "collection without authority level",
        collection: {},
      },
      {
        name: "regular collection",
        collection: {
          authority_level: null,
        },
      },
    ].forEach(({ collection, name }) => {
      it(`doesn't render for ${name}`, () => {
        render(<CollectionAuthorityLevelIcon collection={collection} />);
        expect(screen.queryByLabelText("folder icon")).toBeNull();
      });
    });
  });

  describe("official collections", () => {
    const OFFICIAL_COLLECTION = {
      authority_level: "official",
    };

    function renderOfficialCollection({
      collection = OFFICIAL_COLLECTION,
      ...props
    } = {}) {
      render(
        <CollectionAuthorityLevelIcon collection={collection} {...props} />,
      );
    }

    function queryOfficialIcon() {
      return screen.queryByLabelText("badge icon");
    }

    it(`renders correctly`, () => {
      renderOfficialCollection();
      expect(queryOfficialIcon()).toBeInTheDocument();
    });

    it(`displays a tooltip by default`, () => {
      renderOfficialCollection();
      userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Official collection",
      );
    });

    it(`can display different tooltip`, () => {
      renderOfficialCollection({ tooltip: "belonging" });
      userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Belongs to an Official collection",
      );
    });

    it(`can display custom tooltip text`, () => {
      renderOfficialCollection({ tooltip: "Hello" });
      userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent("Hello");
    });

    it(`can hide tooltip`, () => {
      renderOfficialCollection({ tooltip: null });
      userEvent.hover(queryOfficialIcon());
      expect(screen.queryByLabelText("tooltip")).toBeNull();
    });
  });
});
