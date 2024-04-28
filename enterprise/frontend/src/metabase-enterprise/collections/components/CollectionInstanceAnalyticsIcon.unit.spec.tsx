import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockCollection } from "metabase-types/api/mocks";

import { CollectionInstanceAnalyticsIcon } from "./CollectionInstanceAnalyticsIcon";

describe("CollectionInstanceAnalyticsIcon", () => {
  describe("regular collections", () => {
    [
      {
        name: "collection without any type",
        collection: createMockCollection({
          type: undefined,
        }),
      },
      {
        name: "regular collection",
        collection: createMockCollection({
          type: null,
        }),
      },
    ].forEach(({ collection, name }) => {
      it(`doesn't render for ${name}`, () => {
        render(
          <CollectionInstanceAnalyticsIcon
            collection={collection}
            entity="collection"
          />,
        );
        expect(screen.queryByLabelText("audit icon")).not.toBeInTheDocument();
      });
    });
  });

  describe("instance analytics collections", () => {
    const INSTANCE_ANALYTICS_COLLECTION = createMockCollection({
      type: "instance-analytics",
    });

    function renderInstanceAnalyticsCollection({
      collection = INSTANCE_ANALYTICS_COLLECTION,
      ...props
    }: any = {}) {
      render(
        <CollectionInstanceAnalyticsIcon collection={collection} {...props} />,
      );
    }

    function queryOfficialIcon() {
      return screen.getByLabelText("audit icon");
    }

    ["collection", "dashboard", "model", "question"].forEach(entity => {
      it(`displays the correct tooltip for ${entity}`, async () => {
        renderInstanceAnalyticsCollection({
          entity: entity,
        });
        expect(queryOfficialIcon()).toBeInTheDocument();
        await userEvent.hover(queryOfficialIcon());
        expect(screen.getByRole("tooltip")).toHaveTextContent(
          `This is a read-only Metabase Analytics ${entity}`,
        );
      });
    });
  });
});
