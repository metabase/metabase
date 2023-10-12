/* eslint-disable react/prop-types */
import { t } from "ttag";
import { Box } from "metabase/ui";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import { stringifyUserIdArray, parseUserIdArray } from "metabase/search/utils";

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
    <Box m={width}>
      <SearchUserPicker value={value} onChange={onChange} />
    </Box>
  ),
  fromUrl: parseUserIdArray,
  toUrl: stringifyUserIdArray,
};
