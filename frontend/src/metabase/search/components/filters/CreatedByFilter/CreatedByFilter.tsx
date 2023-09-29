/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import {
  convertUserIdToString,
  parseUserIdString,
} from "metabase/search/utils/user-search-params";

export const CreatedByFilter: SearchFilterDropdown<"created_by"> = {
  iconName: "person",
  title: t`Creator`,
  type: "dropdown",
  DisplayComponent: ({ value }) => (
    <UserNameDisplay title={CreatedByFilter.title} value={value} />
  ),
  ContentComponent: SearchUserPicker,
  fromUrl: parseUserIdString,
  toUrl: convertUserIdToString,
};
