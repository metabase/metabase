import { t } from "ttag";

import type { SearchFilterDropdown } from "metabase/common/search/types";
import {
  parseUserIdArray,
  stringifyUserIdArray,
} from "metabase/common/search/user-search-params";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";

export const CreatedByFilter: SearchFilterDropdown<"created_by"> = {
  iconName: "person",
  label: () => t`Creator`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay label={CreatedByFilter.label()} userIdList={userIdList} />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <SearchUserPicker value={value} width={width} onChange={onChange} />
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
