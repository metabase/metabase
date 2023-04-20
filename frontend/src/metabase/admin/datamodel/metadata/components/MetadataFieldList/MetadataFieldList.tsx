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
import MetadataField from "../MetadataField";
import { SortButtonContainer } from "./MetadataFieldList.styled";

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
  onUpdateTable: (table: Table, updates: Partial<Table>) => void;
}

type MetadataFieldListProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateTable: Tables.actions.updateProperty,
};

const MetadataFieldList = ({
  table,
  idFields,
  onUpdateTable,
}: MetadataFieldListProps) => {
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
            <FieldOrderPopover table={table} onUpdateTable={onUpdateTable} />
          </SortButtonContainer>
        </div>
      </div>
      <SortableFieldList helperClass="ColumnSortHelper" useDragHandle={true}>
        {fields.map((field, index) => (
          <SortableField
            key={field.getId()}
            index={index}
            field={field}
            idFields={idFields}
            selectedDatabaseId={table.db_id}
            selectedSchemaName={table.schema_name}
            selectedTableId={table.id}
            dragHandle={<SortableFieldHandle />}
          />
        ))}
      </SortableFieldList>
    </div>
  );
};

interface FieldListProps {
  children?: ReactNode;
}

const FieldList = ({ children, ...props }: FieldListProps) => {
  return <div {...props}>{children}</div>;
};

const FieldGrabber = () => {
  return <Grabber style={{ width: 10 }} />;
};

interface FieldOrderPopoverProps {
  table: Table;
  onUpdateTable: (table: Table, updates: Partial<Table>) => void;
}

interface TableFieldOrderOption {
  name: string;
  value: TableFieldOrder;
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
          itemIsSelected={({ value }: TableFieldOrderOption) =>
            value === table.field_order
          }
          onChange={({ value }: TableFieldOrderOption) => {
            onUpdateTable(table, { field_order: value });
            closePopover();
          }}
        />
      )}
    />
  );
};

const SortableField = SortableElement(MetadataField);
const SortableFieldList = SortableContainer(FieldList);
const SortableFieldHandle = SortableHandle(FieldGrabber);

export default connect(null, mapDispatchToProps)(MetadataFieldList);
