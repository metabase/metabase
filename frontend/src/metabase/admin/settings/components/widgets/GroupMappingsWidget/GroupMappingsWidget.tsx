import { useCallback } from "react";

import {
  sessionApi,
  useClearGroupMembershipMutation,
  useDeletePermissionsGroupMutation,
  useListPermissionsGroupsQuery,
  useUpdateSettingMutation,
} from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import type { GroupId, GroupInfo } from "metabase-types/api";
import type { Settings } from "metabase-types/api/settings";

import { GroupMappingsWidgetView } from "./GroupMappingsWidgetView";

const EMPTY_GROUP_LIST: GroupInfo[] = [];

type GroupMappingsWidgetProps = {
  mappingSetting: string;
  [key: string]: unknown;
};

export function GroupMappingsWidget(props: GroupMappingsWidgetProps) {
  const dispatch = useDispatch();
  const [updateSetting] = useUpdateSettingMutation();
  const { data } = useListPermissionsGroupsQuery({});
  const allGroups = data ?? EMPTY_GROUP_LIST;
  const mappings = useSelector(
    (state) =>
      // Unjustified type cast. FIXME
      (getSetting(state, props.mappingSetting as keyof Settings) as
        | Record<string, GroupId[]>
        | undefined) ?? {},
  );

  const [deletePermissionsGroup] = useDeletePermissionsGroupMutation();
  const [clearGroupMembership] = useClearGroupMembershipMutation();

  const deleteGroup = useCallback(
    ({ id }: { id: GroupId }) => deletePermissionsGroup(id).unwrap(),
    [deletePermissionsGroup],
  );
  const clearGroupMember = useCallback(
    ({ id }: { id: GroupId }) => clearGroupMembership(id).unwrap(),
    [clearGroupMembership],
  );
  const handleUpdateSetting = useCallback(
    async (args: { key: string; value: Record<string, GroupId[]> }) => {
      // Unjustified type cast. FIXME
      await updateSetting(args as Parameters<typeof updateSetting>[0]).unwrap();
      // The table reads mappings from the session-properties cache. Patch the
      // just-saved value in optimistically so it doesn't blink out between the
      // PUT and the background invalidation refetch (which then confirms it).
      dispatch(
        sessionApi.util.updateQueryData(
          "getSessionProperties",
          undefined,
          (draft) => {
            // Unjustified type cast. FIXME
            (draft as Record<string, unknown>)[args.key] = args.value;
          },
        ),
      );
    },
    [updateSetting, dispatch],
  );

  return (
    <GroupMappingsWidgetView
      // Unjustified type cast. FIXME
      {...(props as unknown as React.ComponentProps<
        typeof GroupMappingsWidgetView
      >)}
      allGroups={allGroups}
      mappings={mappings}
      deleteGroup={deleteGroup}
      clearGroupMember={clearGroupMember}
      updateSetting={handleUpdateSetting}
    />
  );
}
