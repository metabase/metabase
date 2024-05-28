/* eslint-disable react/prop-types */
import { t } from "ttag";

import {
  SearchUserPicker,
  SearchUserPickerContainer,
} from "metabase/search/components/SearchUserPicker";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay";
import type { SearchFilterDropdown } from "metabase/search/types";
import {
  stringifyUserIdArray,
  parseUserIdArray,
} from "metabase/search/utils/user-search-params";

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
