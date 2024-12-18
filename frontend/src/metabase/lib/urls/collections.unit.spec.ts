import _ from "underscore";

import * as utils from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls/collections";
import * as urlsUtils from "metabase/lib/urls/utils";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

describe("Urls.collection", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });
  it('should return "/collection/root" when collection is undefined', () => {
    expect(Urls.collection(undefined)).toBe("/collection/root");
  });

  it('should return "/collection/root" when collection.id is null', () => {
    expect(
      Urls.collection(createMockCollection({ id: null as unknown as number })),
    ).toBe("/collection/root");
  });

  it('should return "/collection/id" when collection.id is a string', () => {
    expect(Urls.collection(createMockCollection({ id: "personal" }))).toBe(
      "/collection/personal",
    );
  });

  it('should return "/collection/trash" when collection is a root trash collection', () => {
    // This test captures the actual behavior of the function, and it's fine,
    // even though the original intent was presumably to use '/trash'.
    // The URL /collection/trash redirects to /trash.
    jest.spyOn(utils, "isRootTrashCollection").mockReturnValueOnce(true);
    expect(Urls.collection(createMockCollection({ id: "trash" }))).toBe(
      "/collection/trash",
    );
  });

  it("should generate slug for root personal collection", () => {
    jest.spyOn(utils, "isRootPersonalCollection").mockReturnValueOnce(true);
    jest
      .spyOn(Urls, "slugifyPersonalCollection")
      .mockImplementationOnce(
        (collection: Pick<Collection, "id" | "name">) =>
          `{collection.id}-${collection.name}`,
      );
    expect(
      Urls.collection(
        createMockCollection({
          id: 1,
          name: "root-personal-collection",
        }),
      ),
    ).toBe("/collection/1-root-personal-collection");
  });

  it("should append slug for non-personal and non-trash collections", () => {
    jest
      .spyOn(urlsUtils, "appendSlug")
      .mockImplementationOnce((path: string | number, slug?: string) =>
        _.compact([path, slug])
          .map(s =>
            typeof s === "string" ? s.replace(/ /g, "-").toLowerCase() : s,
          )
          .join("-"),
      );
    jest.spyOn(utils, "isRootPersonalCollection").mockReturnValueOnce(false);
    jest.spyOn(utils, "isRootTrashCollection").mockReturnValueOnce(false);
    expect(Urls.collection({ id: 1, name: "Regular collection" })).toBe(
      "/collection/1-regular-collection",
    );
  });
});
