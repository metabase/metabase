/* eslint-disable react/prop-types */
import type { EmojiItem } from "@tiptap/extension-emoji";
import cx from "classnames";
import {
  type KeyboardEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import { Button, Card } from "metabase/ui";

import Styles from "./EmojiList.module.css";

export interface EmojiListProps {
  items: EmojiItem[];
  command: (params: { name: string }) => void;
}

export const EmojiList = forwardRef(function InnerEmojiList(
  { items, command }: EmojiListProps,
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];

      if (item) {
        command({ name: item.name });
      }
    },
    [items, command],
  );

  const upHandler = useCallback(() => {
    setSelectedIndex((index) => (index + items.length - 1) % items.length);
  }, [setSelectedIndex, items]);

  const downHandler = useCallback(() => {
    setSelectedIndex((index) => (index + 1) % items.length);
  }, [setSelectedIndex, items]);

  const enterHandler = useCallback(() => {
    selectItem(selectedIndex);
  }, [selectItem, selectedIndex]);

  useEffect(() => setSelectedIndex(0), [items]);

  useImperativeHandle(ref, () => {
    return {
      onKeyDown: (x: { event: KeyboardEvent }) => {
        if (x.event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (x.event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (x.event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      },
    };
  }, [upHandler, downHandler, enterHandler]);

  return (
    <Card withBorder p="sm">
      {items.map((item, index) => (
        <Button
          className={cx({ [Styles.isSelected]: index === selectedIndex })}
          classNames={{
            root: Styles.buttonRoot,
          }}
          justify="start"
          key={index}
          onClick={() => selectItem(index)}
          variant="subtle"
          leftSection={
            item.fallbackImage ? <img src={item.fallbackImage} /> : item.emoji
          }
        >
          {`:${item.name}:`}
        </Button>
      ))}
    </Card>
  );
});
