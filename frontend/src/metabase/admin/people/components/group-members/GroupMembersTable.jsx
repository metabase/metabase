import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { isAdminGroup, isDefaultGroup } from "metabase/lib/groups";
import Icon from "metabase/components/Icon";
import AdminEmptyText from "metabase/components/AdminEmptyText";
import AdminContentTable from "metabase/components/AdminContentTable";
import PaginationControls from "metabase/components/PaginationControls";

import User from "metabase/entities/users";

import AddMemberRow from "./AddMemberRow";

export default function GroupMembersTable({
  group,
  members,
  currentUser: { id: currentUserId } = {},
  users,
  showAddUser,
  text,
  selectedUsers,
  onAddUserCancel,
  onAddUserDone,
  onAddUserTextChange,
  onUserSuggestionAccepted,
  onRemoveUserClicked,
  onRemoveUserFromSelection,
}) {
  // you can't remove people from Default and you can't remove the last user from Admin
  const isCurrentUser = ({ id }) => id === currentUserId;
  const canRemove = user =>
    !isDefaultGroup(group) && !(isAdminGroup(group) && isCurrentUser(user));

  const entityQuery = { group_id: group.id };

  return (
    <User.ListLoader pageSize={25} entityQuery={entityQuery}>
      {({ list, page, pageSize, onNextPage, onPreviousPage, reload }) => {
        const hasMembers = members.length !== 0;

        const handleAddUser = async user => {
          await onAddUserDone();
          reload();
        };

        const handleRemoveUser = async user => {
          await onRemoveUserClicked(user);
          reload();
        };

        return (
          <React.Fragment>
            <AdminContentTable columnTitles={[t`Members`, t`Email`]}>
              {showAddUser && (
                <AddMemberRow
                  users={users}
                  text={text}
                  selectedUsers={selectedUsers}
                  onCancel={onAddUserCancel}
                  onDone={handleAddUser}
                  onTextChange={onAddUserTextChange}
                  onSuggestionAccepted={onUserSuggestionAccepted}
                  onRemoveUserFromSelection={onRemoveUserFromSelection}
                />
              )}
              {list.map((user, index) => (
                <UserRow
                  key={index}
                  user={user}
                  canRemove={canRemove(user)}
                  onRemoveUserClicked={handleRemoveUser}
                />
              ))}
            </AdminContentTable>
            {hasMembers && (
              <div className="flex align-center justify-end p2">
                <PaginationControls
                  page={page}
                  pageSize={pageSize}
                  itemsLength={list.length}
                  total={members.length}
                  onNextPage={onNextPage}
                  onPreviousPage={onPreviousPage}
                />
              </div>
            )}
            {!hasMembers && (
              <div className="mt4 pt4 flex layout-centered">
                <AdminEmptyText
                  message={t`A group is only as good as its members.`}
                />
              </div>
            )}
          </React.Fragment>
        );
      }}
    </User.ListLoader>
  );
}

GroupMembersTable.propTypes = {
  group: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  currentUser: PropTypes.object.isRequired,
  users: PropTypes.array.isRequired,
  showAddUser: PropTypes.bool.isRequired,
  text: PropTypes.string,
  selectedUsers: PropTypes.array,
  onAddUserCancel: PropTypes.func.isRequired,
  onAddUserDone: PropTypes.func.isRequired,
  onAddUserTextChange: PropTypes.func.isRequired,
  onUserSuggestionAccepted: PropTypes.func.isRequired,
  onRemoveUserClicked: PropTypes.func.isRequired,
  onRemoveUserFromSelection: PropTypes.func.isRequired,
};

const UserRow = ({ user, canRemove, onRemoveUserClicked }) => (
  <tr>
    <td>{user.first_name + " " + user.last_name}</td>
    <td>{user.email}</td>
    {canRemove ? (
      <td
        className="text-right cursor-pointer"
        onClick={() => onRemoveUserClicked(user)}
      >
        <Icon name="close" className="text-light" size={16} />
      </td>
    ) : null}
  </tr>
);

UserRow.propTypes = {
  user: PropTypes.object.isRequired,
  canRemove: PropTypes.bool.isRequired,
  onRemoveUserClicked: PropTypes.func.isRequired,
};
