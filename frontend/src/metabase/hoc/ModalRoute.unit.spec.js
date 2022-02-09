import { getParentPath } from "./ModalRoute";

const setup = (routePath, locationPath) => {
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
  });
});
