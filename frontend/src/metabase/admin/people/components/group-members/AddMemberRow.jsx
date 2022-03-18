/* eslint-disable react/prop-types */
import React, { useMemo, useRef } from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import UserAvatar from "metabase/components/UserAvatar";

import { color } from "metabase/lib/colors";
import Typeahead from "metabase/hoc/Typeahead";

import { AddRow } from "../AddRow";

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

const AddMemberAutocompleteSuggestion = ({
  user,
  color,
  selected,
  onClick,
}) => (
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
