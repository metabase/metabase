import cx from "classnames";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { getIcon } from "metabase/lib/icon";
import { Icon } from "metabase/ui";

import S from "./MentionList.module.css";

export interface MentionItem {
  id: string;
  entityId: string | number;
  label: string;
  type: "user" | "card" | "dashboard" | "dataset" | "metric";
  collection?: string;
}

export interface MentionListProps {
  items: MentionItem[];
  command: (props: MentionItem) => void;
}

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const getItemTypeLabel = (type: MentionItem["type"]): string => {
  switch (type) {
    case "card":
      return t`Question`;
    case "dashboard":
      return t`Dashboard`;
    case "dataset":
      return t`Model`;
    case "metric":
      return t`Metric`;
    default:
      return "";
  }
};

const getItemIcon = (item: MentionItem) => {
  if (item.type === "user") {
    return "person";
  }
  return getIcon({ model: item.type }).name;
};

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  function MentionList({ items: _items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const { userItems, contentItems, items } = useMemo(() => {
      const userItems = _items.filter((item) => item.type === "user");
      const contentItems = _items.filter((item) => item.type !== "user");
      const items = [...userItems, ...contentItems];
      return { userItems, contentItems, items };
    }, [_items]);

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
      return (
        <div className={S.mentionList}>
          <div className={S.mentionEmpty}>{t`No results found`}</div>
        </div>
      );
    }

    return (
      <div className={S.mentionList}>
        {userItems.length > 0 && (
          <>
            <div className={S.mentionSectionHeader}>{t`Users`}</div>
            {userItems.map((item) => {
              const index = items.indexOf(item);

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(index)}
                  className={cx(S.mentionItem, {
                    [S.mentionItemSelected]: index === selectedIndex,
                  })}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className={S.mentionItemLabel}>{item.label}</span>
                </button>
              );
            })}
          </>
        )}

        {contentItems.length > 0 && (
          <>
            <div className={S.mentionSectionHeader}>{t`Content`}</div>
            {contentItems.map((item) => {
              const index = items.indexOf(item);

              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectItem(index)}
                  className={cx(S.mentionItem, {
                    [S.mentionItemSelected]: index === selectedIndex,
                  })}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className={S.mentionItemContent}>
                    <div className={S.mentionItemMain}>
                      <Icon
                        name={getItemIcon(item)}
                        size={14}
                        className={S.mentionItemIcon}
                      />
                      <span className={S.mentionItemLabel}>{item.label}</span>
                    </div>
                    <div className={S.mentionItemMeta}>
                      <span className={S.mentionItemType}>
                        {getItemTypeLabel(item.type)}
                      </span>
                      {item.collection && (
                        <>
                          <span className={S.mentionItemSeparator}>·</span>
                          <span className={S.mentionItemCollection}>
                            {item.collection}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  },
);
