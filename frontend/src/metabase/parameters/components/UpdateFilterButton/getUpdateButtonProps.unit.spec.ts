import { getUpdateButtonProps } from "./getUpdateButtonProps";

describe("getUpdateButtonProps", () => {
  describe("non-required parameters", () => {
    it("without both value and unsaved, shows disabled add", () => {
      expect(getUpdateButtonProps([], [])).toStrictEqual({
        label: "Add filter",
        isDisabled: true,
      });
    });

    it("without a value, shows enabled add", () => {
      expect(getUpdateButtonProps([], ["a"])).toStrictEqual({
        label: "Add filter",
        isDisabled: false,
      });
    });

    it("with a different unsaved, shows enabled update", () => {
      expect(getUpdateButtonProps(["New"], ["Hello"])).toStrictEqual({
        label: "Update filter",
        isDisabled: false,
      });
    });

    it("when value is the same, shows disabled update", () => {
      expect(getUpdateButtonProps(["Value"], ["Value"])).toStrictEqual({
        label: "Update filter",
        isDisabled: true,
      });
    });

    it("when unsaved is empty, shows update", () => {
      expect(getUpdateButtonProps(["Value"], [])).toStrictEqual({
        label: "Update filter",
        isDisabled: false,
      });
    });
  });

  describe("required parameters", () => {
    it("without both values, shows reset", () => {
      expect(getUpdateButtonProps([], [], ["CA", "WA"], true)).toStrictEqual({
        label: "Set to default",
        isDisabled: false,
      });
    });

    it("when value equals default, and unsaved is the same, shows disabled reset", () => {
      expect(
        getUpdateButtonProps(["WA", "CA"], ["CA", "WA"], ["CA", "WA"], true),
      ).toStrictEqual({
        label: "Set to default",
        isDisabled: true,
      });
    });

    it("when value equals default, and unsaved is different, shows update", () => {
      expect(
        getUpdateButtonProps(["WA", "CA"], ["WA"], ["CA", "WA"], true),
      ).toStrictEqual({
        label: "Update filter",
        isDisabled: false,
      });
    });

    it("when value does not equal default, and unsaved is different, shows update", () => {
      expect(
        getUpdateButtonProps(["WA"], ["FL"], ["CA", "WA"], true),
      ).toStrictEqual({
        label: "Update filter",
        isDisabled: false,
      });
    });

    it("when value equals default, and unsaved is empty, shows Set to default", () => {
      expect(
        getUpdateButtonProps(["WA", "CA"], [], ["CA", "WA"], true),
      ).toStrictEqual({
        label: "Set to default",
        isDisabled: false,
      });
    });

    it("when value does not equal default, and unsaved is empty, shows Set to default", () => {
      expect(
        getUpdateButtonProps(["WA"], [], ["CA", "WA"], true),
      ).toStrictEqual({
        label: "Set to default",
        isDisabled: false,
      });
    });
  });

  describe("non-required parameters with default value", () => {
    it("without both values, shows disabled update", () => {
      expect(getUpdateButtonProps(null, null, "default")).toStrictEqual({
        label: "Update filter",
        isDisabled: true,
      });
    });

    it("with value not equal default and different unsaved, shows update", () => {
      expect(getUpdateButtonProps("old", "new", "default")).toStrictEqual({
        label: "Update filter",
        isDisabled: false,
      });
    });

    it("with no value and unsaved same as default, shows reset", () => {
      expect(getUpdateButtonProps(null, "default", "default")).toStrictEqual({
        label: "Set to default",
        isDisabled: false,
      });
    });

    it("when value and unsaved are samb but different from default, shows disabled update", () => {
      expect(getUpdateButtonProps("old", "old", "default")).toStrictEqual({
        label: "Update filter",
        isDisabled: true,
      });
    });

    it("when value and unsaved are same as default, shows disabled reset", () => {
      expect(
        getUpdateButtonProps("default", "default", "default"),
      ).toStrictEqual({
        label: "Set to default",
        isDisabled: true,
      });
    });
  });
});
