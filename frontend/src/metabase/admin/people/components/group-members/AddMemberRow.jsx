import React, { useMemo, useRef } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import UserAvatar from "metabase/components/UserAvatar";
import { color } from "metabase/lib/colors";
import Typeahead from "metabase/hoc/Typeahead";

import { AddRow } from "../AddRow";

AddMemberRow.propTypes = {
  users: PropTypes.array.isRequired,
  text: PropTypes.string.isRequired,
  selectedUsers: PropTypes.array.isRequired,
  onCancel: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  onTextChange: PropTypes.func.isRequired,
  onSuggestionAccepted: PropTypes.func.isRequired,
  onRemoveUserFromSelection: PropTypes.func.isRequired,
};

export default function AddMemberRow({
  users,
  text,
  selectedUsers,
  onCancel,
  onDone,
  onTextChange,
  onSuggestionAccepted,
  onRemoveUserFromSelection,
}) {
  const rowRef = useRef(null);

  return (
    <tr>
      <td colSpan="3" style={{ padding: 0 }}>
        <AddRow
          ref={rowRef}
          value={text}
          isValid={!!selectedUsers.length}
          placeholder="Julie McMemberson"
          onChange={e => onTextChange(e.target.value)}
          onDone={onDone}
          onCancel={onCancel}
        >
          {selectedUsers.map(user => (
            <div
              key={user.id}
              className="bg-medium p1 px2 mr1 rounded flex align-center"
            >
              {user.common_name}
              <Icon
                className="pl1 cursor-pointer text-slate text-medium-hover"
                name="close"
                onClick={() => onRemoveUserFromSelection(user)}
              />
            </div>
          ))}
          <AddMemberTypeaheadPopover
            value={text}
            options={Object.values(users)}
            onSuggestionAccepted={onSuggestionAccepted}
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
        <UserAvatar background={color} user={user} />
      </span>
      <span className={cx("h3", { "text-white": selected })}>
        {user.common_name}
      </span>
    </div>
  );
}
