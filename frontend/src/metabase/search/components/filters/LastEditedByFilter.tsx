/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterDropdown } from "metabase/search/types";
import { UserNameDisplay } from "metabase/search/components/UserNameDisplay/UserNameDisplay";
import { SearchUserPicker } from "metabase/search/components/SearchUserPicker/SearchUserPicker";
import { stringifyUserId, parseUserId } from "metabase/search/utils";

export const LastEditedByFilter: SearchFilterDropdown<"last_edited_by"> = {
  iconName: "person",
  label: t`Last edited by`,
  type: "dropdown",
  DisplayComponent: ({ value: userId }) => (
    <UserNameDisplay userId={userId} label={LastEditedByFilter.label} />
  ),
  ContentComponent: SearchUserPicker,
  fromUrl: parseUserId,
  toUrl: stringifyUserId,
};
