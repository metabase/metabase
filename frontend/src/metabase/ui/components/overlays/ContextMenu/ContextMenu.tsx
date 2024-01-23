import * as RadixMenu from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";

import "./ContextMenu.styles.css";
import { Icon } from "../../icons";

export type MenuItem =
  | {
      name: string;
      onSelect: () => void;
    }
  | {
      name: string;
      children: MenuItem[];
    };

export function ContextMenu({
  menuItems,
  children,
}: {
  menuItems: MenuItem[];
  children: ReactNode;
}) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger>{children}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="ContextMenuContent">
          {menuItems.map(item => (
            <MenuItemComponent key={item.name} item={item} />
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

function MenuItemComponent({ item }: { item: MenuItem }) {
  if (!("children" in item)) {
    return (
      <RadixMenu.Item onSelect={item.onSelect} className="ContextMenuItem">
        {item.name}
      </RadixMenu.Item>
    );
  }

  return (
    <RadixMenu.Sub>
      <RadixMenu.SubTrigger className="ContextMenuSubTrigger">
        {item.name}
        <div className="RightSlot">
          <Icon name="chevronright" />
        </div>
      </RadixMenu.SubTrigger>
      <RadixMenu.Portal>
        <RadixMenu.SubContent className="ContextMenuSubContent">
          {item.children.map(child => (
            <MenuItemComponent key={child.name} item={child} />
          ))}
        </RadixMenu.SubContent>
      </RadixMenu.Portal>
    </RadixMenu.Sub>
  );
}
