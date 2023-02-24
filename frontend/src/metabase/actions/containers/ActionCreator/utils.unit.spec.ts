import {
  createMockActionFormSettings,
  createMockFieldSettings,
  createMockParameter,
} from "metabase-types/api/mocks";
import { syncFieldsWithParameters } from "./utils";

describe("syncFieldsWithParameters", () => {
  it("should not modify settings if there are no changed parameters", () => {
    const settings = createMockActionFormSettings({
      fields: {
        u1: createMockFieldSettings({ id: "u1" }),
        u2: createMockFieldSettings({ id: "u2" }),
      },
    });

    const parameters = [
      createMockParameter({
        id: "u1",
      }),
      createMockParameter({
        id: "u2",
      }),
    ];

    expect(syncFieldsWithParameters(settings, parameters)).toBe(settings);
  });

  it("should add new fields and remove non-existing ones", () => {
    const settings = createMockActionFormSettings({
      fields: {
        u1: createMockFieldSettings({ id: "u1" }),
        u2: createMockFieldSettings({ id: "u2", fieldType: "number" }),
      },
    });

    const parameters = [
      createMockParameter({
        id: "u2",
      }),
      createMockParameter({
        id: "u3",
      }),
    ];

    expect(syncFieldsWithParameters(settings, parameters)).toMatchObject({
      fields: {
        u2: { id: "u2", fieldType: "number" },
        u3: { id: "u3", fieldType: "string" },
      },
    });
  });
});
