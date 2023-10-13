/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker";
import {
  stringifyUserIdArray,
  parseUserIdArray,
} from "metabase/search/utils/user-search-params";
import { Box } from "metabase/ui";

export const CreatedByFilter: SearchFilterDropdown<"created_by"> = {
  iconName: "person",
  label: () => t`Creator`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay label={CreatedByFilter.label()} userIdList={userIdList} />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <Box w={width}>
      <SearchUserPicker value={value} onChange={onChange} />
    </Box>
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
