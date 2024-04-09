import { mockSettings } from "__support__/settings";

import { getParentPath } from "./ModalRoute";

const setup = (routePath, locationPath, siteURL = undefined) => {
  if (siteURL) {
    mockSettings({ "site-url": siteURL });
  }

  return getParentPath({ path: routePath }, { pathname: locationPath });
};

describe("getParentPath", () => {
  describe("returns should cut off current route path", () => {
    it("without trailing slash", () => {
      const parentPath = setup(
        "segmented/group/5",
        "/admin/permissions/database/1/schema/2/table/3/segmented/group/5",
      );

      expect(parentPath).toEqual(
        "/admin/permissions/database/1/schema/2/table/3",
      );
    });

    it("with trailing slash", () => {
      const parentPath = setup(
        "segmented/group/5/",
        "/admin/permissions/database/1/schema/2/table/3/segmented/group/5/",
      );

      expect(parentPath).toEqual(
        "/admin/permissions/database/1/schema/2/table/3",
      );
    });

    it("for one route segment", () => {
      const parentPath = setup("c", "/a/b/c");

      expect(parentPath).toEqual("/a/b");
    });

    it("without single segment site url subpath", () => {
      const parentPath = setup(
        "c",
        "metabase/a/b/c",
        "https://somesite.com/metabase",
      );

      expect(parentPath).toEqual("/a/b");
    });

    it("without multi segment site url subpath", () => {
      const parentPath = setup(
        "c",
        "meta/base/a/b/c",
        "https://somesite.com/meta/base",
      );

      expect(parentPath).toEqual("/a/b");
    });

    // This is to handle the edge case where someone uses a subpath name
    // like "data" that is also used within Metabase's routes
    // e.g. If the site-url is "https://corp.com/data", it should not
    // remove the second "data" from the path in "https://corp.com/data/admin/permissions/data/groups"
    it("without leading url subpath while preserving later occurances", () => {
      const parentPath = setup(
        "groups",
        "data/admin/permissions/data/groups",
        "https://corp.com/data",
      );

      expect(parentPath).toEqual("/admin/permissions/data");
    });
  });
});
