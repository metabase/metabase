import cx from "classnames";
import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import UserAvatar from "metabase/components/UserAvatar";
import CS from "metabase/css/core/index.css";
import Typeahead from "metabase/hoc/Typeahead";
import { color } from "metabase/lib/colors";
import { Icon, UnstyledButton } from "metabase/ui";
import type { User } from "metabase-types/api";

import { AddRow } from "./AddRow";

interface AddMemberRowProps {
  users: User[];
  excludeIds: Set<number>;
  onCancel: () => void;
  onDone: (userIds: number[]) => void;
}

export function AddMemberRow({
  users,
  excludeIds,
  onCancel,
  onDone,
}: AddMemberRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [selectedUsersById, setSelectedUsersById] = useState<Map<number, User>>(
    new Map(),
  );

  const handleRemoveUser = (user: User) => {
    const newSelectedUsersById = new Map(selectedUsersById);
    newSelectedUsersById.delete(user.id);
    setSelectedUsersById(newSelectedUsersById);
  };

  const handleAddUser = (user: User) => {
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
        (user) => !selectedUsersById.has(user.id) && !excludeIds.has(user.id),
      ),
    [selectedUsersById, excludeIds, users],
  );

  return (
    <tr>
      <td colSpan={4} style={{ padding: 0 }}>
        <AddRow
          ref={rowRef}
          value={text}
          isValid={selectedUsersById.size > 0}
          placeholder={t`Julie McMemberson`}
          onChange={(e) => setText(e.target.value)}
          onDone={handleDone}
          onCancel={onCancel}
        >
          {Array.from(selectedUsersById.values()).map((user) => (
            <div
              key={user.id}
              className={cx(
                CS.bgMedium,
                CS.p1,
                CS.px2,
                CS.mr1,
                CS.rounded,
                CS.flex,
                CS.alignCenter,
              )}
            >
              {user.common_name}
              <Icon
                className={cx(
                  CS.pl1,
                  CS.cursorPointer,
                  CS.textSlate,
                  CS.textMediumHover,
                )}
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

interface AddMemberTypeaheadPopoverProps {
  suggestions: User[];
  selectedSuggestion: User | null;
  onSuggestionAccepted: (user: User) => void;
  target: React.RefObject<HTMLDivElement>;
}

const AddMemberTypeaheadPopover = Typeahead({
  optionFilter: (text: string, user: User) =>
    (user.common_name || "").toLowerCase().includes(text.toLowerCase()),
  optionIsEqual: (userA: User, userB: User) => userA.id === userB.id,
})(function AddMemberTypeaheadPopover({
  suggestions,
  selectedSuggestion,
  onSuggestionAccepted,
  target,
}: AddMemberTypeaheadPopoverProps) {
  const colors = useMemo(getColorPalette, []);

  return (
    <TippyPopover
      className={CS.bordered}
      offset={[0, 0]}
      placement="bottom-start"
      visible={suggestions.length > 0}
      reference={target}
      content={
        suggestions &&
        suggestions.map((user: User, index: number) => (
          <AddMemberAutocompleteSuggestion
            key={index}
            user={user}
            color={colors[index % colors.length]}
            selected={!!selectedSuggestion && user.id === selectedSuggestion.id}
            onClick={onSuggestionAccepted.bind(null, user)}
          />
        ))
      }
    />
  );
});

interface AddMemberAutocompleteSuggestionProps {
  user: User;
  color: string;
  selected: boolean;
  onClick: () => void;
}

function AddMemberAutocompleteSuggestion({
  user,
  color,
  selected,
  onClick,
}: AddMemberAutocompleteSuggestionProps) {
  return (
    <UnstyledButton
      p="0.5rem 1rem"
      bg={selected ? "brand" : ""}
      onClick={onClick}
    >
      <span className={cx(CS.inlineBlock, CS.mr2)}>
        <UserAvatar bg={color} user={user} />
      </span>
      <span className={cx(CS.h3, { [CS.textWhite]: selected })}>
        {user.common_name}
      </span>
    </UnstyledButton>
  );
}
