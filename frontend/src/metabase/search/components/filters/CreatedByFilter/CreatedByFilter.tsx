import { t } from "ttag";

import type { SearchFilterDropdown } from "metabase/common/search/types";
import {
  parseUserIdArray,
  stringifyUserIdArray,
} from "metabase/common/search/user-search-params";
import {
  SearchUserPicker,
  SearchUserPickerContainer,
} from "metabase/search/components/SearchUserPicker";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";

export const CreatedByFilter: SearchFilterDropdown<"created_by"> = {
  iconName: "person",
  label: () => t`Creator`,
  type: "dropdown",
  DisplayComponent: ({ value: userIdList }) => (
    <UserNameDisplay label={CreatedByFilter.label()} userIdList={userIdList} />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <SearchUserPickerContainer w={width}>
      <SearchUserPicker value={value} onChange={onChange} />
    </SearchUserPickerContainer>
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
