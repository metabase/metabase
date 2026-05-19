import { QueryStatus } from "@reduxjs/toolkit/query";

import { createMockEntitiesState } from "__support__/store";
import {
  createMockAdminState,
  createMockApiState,
  createMockPermissionsState,
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { GroupsPermissions } from "metabase-types/api";
import {
  createMockDatabase,
  createMockGroup,
  createMockSchema,
  createMockTable,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DataPermission, DataPermissionValue } from "../../types";

import {
  getDatabasesPermissionEditor,
  getShouldShowTransformPermissions,
} from "./permission-editor";

describe("getShouldShowTransformPermissions", () => {
  describe("OSS version", () => {
    it("should return false for OSS version regardless of other settings", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": true,
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });

  describe("Pro Self-Hosted", () => {
    it("should return true when transforms feature and setting are both enabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures({
            "transforms-basic": true,
          }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(true);
    });

    it("should return false when transforms feature is enabled but setting is disabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": false,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({
            "transforms-basic": true,
          }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });

  describe("Pro Cloud", () => {
    it("should return true when transforms feature is enabled (ignores setting)", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({
            "transforms-basic": true,
          }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(true);
    });

    it("should return false when transforms feature is disabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": false,
          "token-features": createMockTokenFeatures({
            "transforms-basic": false,
          }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });

    it("should return false when transforms feature is disabled even when the setting is enabled", () => {
      const state = createMockState({
        settings: createMockSettingsState({
          "is-hosted?": true,
          "transforms-enabled": true,
          "token-features": createMockTokenFeatures({
            "transforms-basic": false,
          }),
        }),
      });

      expect(getShouldShowTransformPermissions(state)).toBe(false);
    });
  });
});

describe("getDatabasesPermissionEditor", () => {
  it("does not crash when the selected group has no member count (#74290)", () => {
    const groupWithoutMemberCount = createMockGroup({
      id: 1,
      name: "All Users",
      magic_group_type: "all-internal-users",
    });
    Reflect.deleteProperty(groupWithoutMemberCount, "member_count");

    const permissions: GroupsPermissions = {
      1: {
        3: {
          [DataPermission.CREATE_QUERIES]:
            DataPermissionValue.QUERY_BUILDER_AND_NATIVE,
          [DataPermission.VIEW_DATA]: DataPermissionValue.UNRESTRICTED,
        },
      },
    };

    const state = createMockState({
      admin: createMockAdminState({
        permissions: createMockPermissionsState({
          dataPermissions: permissions,
          originalDataPermissions: permissions,
        }),
      }),
      entities: createMockEntitiesState({
        databases: [
          createMockDatabase({
            id: 3,
            name: "Test Database",
            tables: [
              createMockTable({
                id: 10,
                db_id: 3,
                display_name: "People",
                schema: "public",
              }),
            ],
          }),
        ],
        schemas: [createMockSchema({ id: "3:public", name: "public" })],
      }),
      "metabase-api": {
        ...createMockApiState(),
        queries: {
          "listPermissionsGroups({})": {
            status: QueryStatus.fulfilled,
            data: [groupWithoutMemberCount],
            error: undefined,
            originalArgs: {},
            requestId: "test-request-groups",
            endpointName: "listPermissionsGroups",
            startedTimeStamp: Date.now(),
            fulfilledTimeStamp: Date.now(),
          },
        },
      },
    });

    const editor = getDatabasesPermissionEditor(state, {
      params: {
        groupId: "1",
        databaseId: "3",
      },
    });

    expect(editor?.description).toBeNull();
  });
});
