import React, { useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { Icon } from "metabase/core/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import UserAvatar from "metabase/components/UserAvatar";
import { color } from "metabase/lib/colors";
import Typeahead from "metabase/hoc/Typeahead";
import { AddRow } from "./AddRow";

AddMemberRow.propTypes = {
  users: PropTypes.array.isRequired,
  excludeIds: PropTypes.object,
  onCancel: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
};

export default function AddMemberRow({ users, excludeIds, onCancel, onDone }) {
  const rowRef = useRef(null);
  const [text, setText] = useState("");
  const [selectedUsersById, setSelectedUsersById] = useState(new Map());

  const handleRemoveUser = user => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.delete(user.id);
    setSelectedUsersById(newSelectedUsersById);
  };

  const handleAddUser = user => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.set(user.id, user);
    setSelectedUsersById(newSelectedUsersById);
    setText("");
  };

  const handleDone = () => {
    onDone(Array.from(selectedUsersById.keys()));
  };

  const availableToSelectUsers = useMemo(
    () =>
      users.filter(
        user => !selectedUsersById.has(user.id) && !excludeIds.has(user.id),
      ),
    [selectedUsersById, excludeIds, users],
  );

  return (
    <tr>
      <td colSpan="4" style={{ padding: 0 }}>
        <AddRow
          ref={rowRef}
          value={text}
          isValid={selectedUsersById.size > 0}
          placeholder="Julie McMemberson"
          onChange={e => setText(e.target.value)}
          onDone={handleDone}
          onCancel={onCancel}
        >
          {Array.from(selectedUsersById.values()).map(user => (
            <div
              key={user.id}
              className="bg-medium p1 px2 mr1 rounded flex align-center"
            >
              {user.common_name}
              <Icon
                className="pl1 cursor-pointer text-slate text-medium-hover"
                name="close"
                onClick={() => handleRemoveUser(user)}
              />
            </div>
          ))}
          <AddMemberTypeaheadPopover
            value={text}
            options={availableToSelectUsers}
            onSuggestionAccepted={handleAddUser}
            target={rowRef}
          />
        </AddRow>
      </td>
    </tr>
  );
}

const getColorPalette = () => [
  color("brand"),
  color("accent1"),
  color("accent2"),
  color("accent3"),
  color("accent4"),
];

const AddMemberTypeaheadPopoverPropTypes = {
  suggestions: PropTypes.array,
  selectedSuggestion: PropTypes.object,
  onSuggestionAccepted: PropTypes.func.isRequired,
  target: PropTypes.shape({
    current: PropTypes.instanceOf(Element),
  }),
};

const AddMemberTypeaheadPopover = Typeahead({
  optionFilter: (text, user) =>
    (user.common_name || "").toLowerCase().includes(text.toLowerCase()),
  optionIsEqual: (userA, userB) => userA.id === userB.id,
})(function AddMemberTypeaheadPopover({
  suggestions,
  selectedSuggestion,
  onSuggestionAccepted,
  target,
}) {
  const colors = useMemo(getColorPalette, []);

  return (
    <TippyPopover
      className="bordered"
      offset={0}
      placement="bottom-start"
      visible={suggestions.length > 0}
      reference={target}
      content={
        suggestions &&
        suggestions.map((user, index) => (
          <AddMemberAutocompleteSuggestion
            key={index}
            user={user}
            color={colors[index % colors.length]}
            selected={selectedSuggestion && user.id === selectedSuggestion.id}
            onClick={onSuggestionAccepted.bind(null, user)}
          />
        ))
      }
    />
  );
});

AddMemberTypeaheadPopover.propTypes = AddMemberTypeaheadPopoverPropTypes;

AddMemberAutocompleteSuggestion.propTypes = {
  user: PropTypes.object.isRequired,
  color: PropTypes.string.isRequired,
  selected: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};

function AddMemberAutocompleteSuggestion({ user, color, selected, onClick }) {
  return (
    <div
      className={cx("px2 py1 cursor-pointer", { "bg-brand": selected })}
      onClick={onClick}
    >
      <span className="inline-block mr2">
        <UserAvatar bg={color} user={user} />
      </span>
      <span className={cx("h3", { "text-white": selected })}>
        {user.common_name}
      </span>
    </div>
  );
}
