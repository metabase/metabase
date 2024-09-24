import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionAuthorityLevelIcon } from "./CollectionAuthorityLevelIcon";

describe("CollectionAuthorityLevelIcon", () => {
  describe("regular collections", () => {
    [
      {
        name: "collection without authority level",
        collection: createMockCollection({ authority_level: undefined }),
      },
      {
        name: "regular collection",
        collection: createMockCollection({
          authority_level: null,
        }),
      },
    ].forEach(({ collection, name }) => {
      it(`doesn't render for ${name}`, () => {
        render(<CollectionAuthorityLevelIcon collection={collection} />);
        expect(screen.queryByLabelText("folder icon")).not.toBeInTheDocument();
      });
    });
  });

  describe("official collections", () => {
    const OFFICIAL_COLLECTION = createMockCollection({
      authority_level: "official",
    });

    function renderOfficialCollection({
      collection = OFFICIAL_COLLECTION,
      ...props
    }: any = {}) {
      render(
        <CollectionAuthorityLevelIcon collection={collection} {...props} />,
      );
    }

    function queryOfficialIcon() {
      return screen.getByLabelText("verified_collection icon");
    }

    it(`renders correctly`, () => {
      renderOfficialCollection();
      expect(queryOfficialIcon()).toBeInTheDocument();
    });

    it(`displays a tooltip by default`, async () => {
      renderOfficialCollection();
      await userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Official collection",
      );
    });

    it(`can display different tooltip`, async () => {
      renderOfficialCollection({ tooltip: "belonging" });
      await userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Belongs to an Official collection",
      );
    });

    it(`can display custom tooltip text`, async () => {
      renderOfficialCollection({ tooltip: "Hello" });
      await userEvent.hover(queryOfficialIcon());
      expect(screen.getByRole("tooltip")).toHaveTextContent("Hello");
    });

    it(`can hide tooltip`, async () => {
      renderOfficialCollection({ tooltip: null });
      await userEvent.hover(queryOfficialIcon());
      expect(screen.queryByLabelText("tooltip")).not.toBeInTheDocument();
    });
  });
});
