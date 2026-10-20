import * as Lib from "metabase-lib";
import { SAMPLE_DATABASE, SAMPLE_METADATA } from "metabase-lib/test-helpers";
import type { TemplateTag } from "metabase-types/api";
import {
  createMockDatabase,
  createMockFieldSettings,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { canEditActionQuery, getFieldSettingsFromQuery } from "./utils";

const STATUS_TAG: TemplateTag = {
  id: "status-tag",
  name: "status",
  "display-name": "Status",
  type: "text",
};

const ID_TAG: TemplateTag = {
  id: "id-tag",
  name: "id",
  "display-name": "ID",
  type: "number",
};

function createQuery(tags: TemplateTag[]): Lib.Query {
  const metadataProvider = Lib.metadataProvider(
    SAMPLE_DATABASE.id,
    SAMPLE_METADATA,
  );
  const query = Lib.nativeQuery(
    SAMPLE_DATABASE.id,
    metadataProvider,
    `SELECT ${tags.map((tag) => `{{${tag.name}}}`).join(", ")}`,
  );
  return Lib.withTemplateTags(
    query,
    Object.fromEntries(tags.map((tag) => [tag.name, tag])),
  );
}

describe("getFieldSettingsFromQuery", () => {
  it("should make the fields of new variables required", () => {
    const { fields } = getFieldSettingsFromQuery(
      createQuery([STATUS_TAG, ID_TAG]),
      {},
    );

    expect(fields?.[STATUS_TAG.id]).toMatchObject({
      fieldType: "string",
      required: true,
    });
    expect(fields?.[ID_TAG.id]).toMatchObject({
      fieldType: "number",
      required: true,
    });
  });

  it("should keep the field of a variable that is not required", () => {
    const { fields } = getFieldSettingsFromQuery(
      createQuery([{ ...STATUS_TAG, required: false }, ID_TAG]),
      {},
    );

    expect(fields?.[STATUS_TAG.id]).toMatchObject({ required: false });
  });

  it("should keep the settings of a field whose variable type is unchanged", () => {
    const field = createMockFieldSettings({
      id: STATUS_TAG.id,
      title: "Order status",
      hidden: true,
      order: 1,
    });

    const { fields } = getFieldSettingsFromQuery(
      createQuery([STATUS_TAG, ID_TAG]),
      { fields: { [STATUS_TAG.id]: field } },
    );

    expect(fields?.[STATUS_TAG.id]).toEqual(field);
  });

  it("should keep the settings of a field whose variable type changed", () => {
    const field = createMockFieldSettings({
      id: STATUS_TAG.id,
      title: "Order status",
      description: "The new status",
      hidden: true,
      required: false,
      order: 1,
      fieldType: "string",
      inputType: "select",
      valueOptions: ["1", "2", "shipped"],
      defaultValue: "2",
    });

    const { fields } = getFieldSettingsFromQuery(
      createQuery([{ ...STATUS_TAG, type: "number" }, ID_TAG]),
      { fields: { [STATUS_TAG.id]: field } },
    );

    expect(fields?.[STATUS_TAG.id]).toEqual({
      ...field,
      fieldType: "number",
      inputType: "select",
      valueOptions: [1, 2],
      defaultValue: 2,
    });
  });

  it("should drop the settings of removed variables", () => {
    const { fields } = getFieldSettingsFromQuery(createQuery([ID_TAG]), {
      fields: {
        removed: createMockFieldSettings({ id: "removed" }),
      },
    });

    expect(Object.keys(fields ?? {})).toEqual([ID_TAG.id]);
  });
});

describe("canEditActionQuery", () => {
  const action = createMockQueryAction({ database_id: 1, can_write: true });

  it("should allow editing with native query permissions on the action database", () => {
    const databases = [
      createMockDatabase({ id: 1, native_permissions: "write" }),
    ];

    expect(canEditActionQuery(action, databases)).toBe(true);
  });

  it("should not allow editing without native query permissions on the action database", () => {
    const databases = [
      createMockDatabase({ id: 1, native_permissions: "none" }),
      createMockDatabase({ id: 2, native_permissions: "write" }),
    ];

    expect(canEditActionQuery(action, databases)).toBe(false);
  });

  it("should not allow editing without write access to the action", () => {
    const databases = [
      createMockDatabase({ id: 1, native_permissions: "write" }),
    ];

    expect(canEditActionQuery({ ...action, can_write: false }, databases)).toBe(
      false,
    );
  });
});
