import cx from "classnames";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { t } from "ttag";

import S from "./MentionList.module.css";

export interface MentionListProps {
  items: Array<{ id: string; label: string }>;
  command: (props: { id: string }) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const handleSelectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prevIndex) =>
            prevIndex > 0 ? prevIndex - 1 : items.length - 1,
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prevIndex) =>
            prevIndex < items.length - 1 ? prevIndex + 1 : 0,
          );
          return true;
        }

        if (event.key === "Enter") {
          event.stopPropagation();
          handleSelectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    if (!items.length) {
      return <div className={S.mentionEmpty}>{t`No users found`}</div>;
    }

    return (
      <div className={S.mentionList}>
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => handleSelectItem(index)}
            className={cx(S.mentionItem, {
              [S.mentionItemSelected]: index === selectedIndex,
            })}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  },
);
