import { t } from "ttag";

import { parseUserIdArray, stringifyUserIdArray } from "metabase/common/search";
import type { SearchFilterDropdown } from "metabase/common/search/types";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import { SearchUserPickerContainer } from "metabase/search/components/SearchUserPicker/SearchUserPicker.styled";
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
    <SearchUserPickerContainer w={width}>
      <SearchUserPicker value={value} onChange={onChange} />
    </SearchUserPickerContainer>
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
