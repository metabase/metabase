import React, { ReactNode } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import Tables from "metabase/entities/tables";
import Icon from "metabase/components/Icon/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import Grabber from "metabase/components/Grabber";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "metabase/components/sortable";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { TableFieldOrder } from "metabase-types/api";
import Table from "metabase-lib/metadata/Table";
import Field from "metabase-lib/metadata/Field";
import MetadataTableColumn from "../MetadataTableColumn";
import { SortButtonContainer } from "./MetadataTableColumnList.styled";

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

interface OwnProps {
  table: Table;
  idFields: Field[];
}

interface DispatchProps {
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
}

type MetadataTableColumnListProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateTable: Tables.actions.updateProperty,
};

const MetadataTableColumnList = ({
  table,
  idFields,
  onUpdateTable,
}: MetadataTableColumnListProps) => {
  const { fields = [] } = table;

  return (
    <div id="ColumnsList" className="my3">
      <div className="text-uppercase text-medium py1">
        <div className="relative">
          <div
            style={{ minWidth: 420 }}
            className="float-left px1"
          >{t`Column`}</div>
          <div className="flex">
            <div className="flex-half pl3">{t`Visibility`}</div>
            <div className="flex-half">
              <span>{t`Type`}</span>
            </div>
          </div>
          <SortButtonContainer>
            <TableFieldOrderDropdown
              table={table}
              onUpdateTable={onUpdateTable}
            />
          </SortButtonContainer>
        </div>
      </div>
      <SortableColumnList helperClass="ColumnSortHelper" useDragHandle={true}>
        {fields.map((field, index) => (
          <SortableColumn
            key={field.getId()}
            index={index}
            field={field}
            idFields={idFields}
            selectedDatabaseId={table.db_id}
            selectedSchemaName={table.schema_name}
            selectedTableId={table.id}
            dragHandle={<SortableColumnHandle />}
          />
        ))}
      </SortableColumnList>
    </div>
  );
};

interface ColumnListProps {
  children?: ReactNode;
}

const ColumnList = ({ children, ...props }: ColumnListProps) => {
  return <div {...props}>{children}</div>;
};

const ColumnGrabber = () => {
  return <Grabber style={{ width: 10 }} />;
};

interface TableFieldOrderOption {
  name: string;
  value: TableFieldOrder;
}

interface TableFieldOrderDropdownProps {
  table: Table;
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
}

const TableFieldOrderDropdown = ({
  table,
  onUpdateTable,
}: TableFieldOrderDropdownProps) => {
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
          itemIsSelected={({ value }: TableFieldOrderOption) =>
            value === table.field_order
          }
          onChange={({ value }: TableFieldOrderOption) => {
            onUpdateTable(table, "field_order", value);
            closePopover();
          }}
        />
      )}
    />
  );
};

const SortableColumn = SortableElement(MetadataTableColumn);
const SortableColumnList = SortableContainer(ColumnList);
const SortableColumnHandle = SortableHandle(ColumnGrabber);

export default connect(null, mapDispatchToProps)(MetadataTableColumnList);
