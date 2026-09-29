import { t } from "ttag";

import { parseUserIdArray, stringifyUserIdArray } from "metabase/common/search";
import type { SearchFilterDropdown } from "metabase/common/search/types";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay/UserNameDisplay";

export const LastEditedByFilter: SearchFilterDropdown<"last_edited_by"> = {
  iconName: "person",
  label: () => t`Last editor`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay
      userIdList={userIdList}
      label={LastEditedByFilter.label()}
    />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <SearchUserPicker value={value} width={width} onChange={onChange} />
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
