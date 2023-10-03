/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";
import {
  stringifyUserIdArray,
  parseUserIdArray,
} from "metabase/search/utils/user-search-params";

export const CreatedByFilter: SearchFilterDropdown<"created_by"> = {
  iconName: "person",
  label: t`Creator`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay label={CreatedByFilter.label} userIdList={userIdList} />
  ),
  ContentComponent: SearchUserPicker,
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
