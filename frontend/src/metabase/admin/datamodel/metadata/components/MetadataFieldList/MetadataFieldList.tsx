import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { TableFieldOrder } from "metabase-types/api";
import Table from "metabase-lib/metadata/Table";

interface OrderOption {
  name: string;
  value: TableFieldOrder;
}

const ORDER_SECTIONS = [
  {
    items: [
      { name: t`Database`, value: "database" },
      { name: t`Alphabetical`, value: "alphabetical" },
      { name: t`Custom`, value: "custom" },
      { name: t`Smart`, value: "smart" },
    ],
  },
];

export interface FieldOrderPopoverProps {
  table: Table;
  onUpdateTable: (table: Table, updates: Partial<Table>) => void;
}

const FieldOrderPopover = ({
  table,
  onUpdateTable,
}: FieldOrderPopoverProps) => {
  return (
    <TippyPopoverWithTrigger
      triggerContent={
        <span
          className="text-brand text-bold"
          style={{ textTransform: "none", letterSpacing: 0 }}
        >
          <Icon
            className="ml1"
            name="sort_arrows"
            size={14}
            style={{ transform: "translateY(2px)" }}
          />
        </span>
      }
      popoverContent={({ closePopover }) => (
        <AccordionList
          className="text-brand"
          sections={ORDER_SECTIONS}
          alwaysExpanded
          itemIsSelected={({ value }: OrderOption) =>
            value === table.field_order
          }
          onChange={({ value }: OrderOption) => {
            onUpdateTable(table, { field_order: value });
            closePopover();
          }}
        />
      )}
    />
  );
};

export default FieldOrderPopover;
