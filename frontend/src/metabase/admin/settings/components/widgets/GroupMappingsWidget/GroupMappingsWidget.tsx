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

import type { MappingSettingKey } from "./GroupMappingsWidgetView";
import { GroupMappingsWidgetView } from "./GroupMappingsWidgetView";

const EMPTY_GROUP_LIST: GroupInfo[] = [];

type GroupMappingsWidgetProps = {
  mappingSetting: MappingSettingKey;
  [key: string]: unknown;
};

export function GroupMappingsWidget(props: GroupMappingsWidgetProps) {
  const dispatch = useDispatch();
  const [updateSetting] = useUpdateSettingMutation();
  const { data } = useListPermissionsGroupsQuery({});
  const allGroups = data ?? EMPTY_GROUP_LIST;
  const mappings = useSelector(
    (state) => getSetting(state, props.mappingSetting) ?? {},
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
    async (args: {
      key: MappingSettingKey;
      value: Record<string, GroupId[]>;
    }) => {
      await updateSetting(args).unwrap();
      // For this particular setting we don't need to fully wait for the refetch.
      // So long as unwrap succeeds, we can update the cache to reflect the new value
      dispatch(
        sessionApi.util.updateQueryData(
          "getSessionProperties",
          undefined,
          (draft) => {
            draft[args.key] = args.value;
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
