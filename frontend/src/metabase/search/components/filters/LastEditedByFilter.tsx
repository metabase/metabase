/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import { stringifyUserIdArray, parseUserIdArray } from "metabase/search/utils";
import { Stack } from "metabase/ui";

export const LastEditedByFilter: SearchFilterDropdown<"last_edited_by"> = {
  iconName: "person",
  label: () => t`Last edited by`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay
      userIdList={userIdList}
      label={LastEditedByFilter.label()}
    />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <Stack
      w={width}
      style={{
        overflow: "hidden",
      }}
    >
      <SearchUserPicker value={value} onChange={onChange} />
    </Stack>
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
