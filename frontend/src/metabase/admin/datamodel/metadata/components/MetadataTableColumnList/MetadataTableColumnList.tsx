import React, { ReactNode, useCallback, useMemo } from "react";
import { connect } from "react-redux";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";
import Tables from "metabase/entities/tables";
import { Icon } from "metabase/core/components/Icon";
import AccordionList from "metabase/core/components/AccordionList";
import Grabber from "metabase/components/Grabber";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "metabase/components/sortable";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { FieldId, SchemaId, TableFieldOrder } from "metabase-types/api";
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
  selectedSchemaId: SchemaId;
}

interface DispatchProps {
  onUpdateTable: (table: Table, name: string, value: unknown) => void;
  onUpdateFieldOrder: (table: Table, fieldOrder: FieldId[]) => void;
}

interface DragProps {
  oldIndex: number;
  newIndex: number;
}

type MetadataTableColumnListProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateTable: Tables.actions.updateProperty,
  onUpdateFieldOrder: Tables.actions.setFieldOrder,
};

const MetadataTableColumnList = ({
  table,
  idFields,
  selectedSchemaId,
  onUpdateTable,
  onUpdateFieldOrder,
}: MetadataTableColumnListProps) => {
  const { fields = [], visibility_type } = table;
  const isHidden = visibility_type != null;

  const sortedFields = useMemo(
    () => _.sortBy(fields, field => field.position),
    [fields],
  );

  const handleSortStart = useCallback(() => {
    document.body.classList.add("grabbing");
  }, []);

  const handleSortEnd = useCallback(
    ({ oldIndex, newIndex }: DragProps) => {
      document.body.classList.remove("grabbing");

      const fieldOrder = updateFieldOrder(sortedFields, oldIndex, newIndex);
      onUpdateFieldOrder(table, fieldOrder);
    },
    [table, sortedFields, onUpdateFieldOrder],
  );

  return (
    <div id="ColumnsList" className={cx("my3", { disabled: isHidden })}>
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
      <SortableColumnList
        helperClass="ColumnSortHelper"
        useDragHandle={true}
        onSortStart={handleSortStart}
        onSortEnd={handleSortEnd}
      >
        {sortedFields.map((field, index) => (
          <SortableColumn
            key={field.getId()}
            index={index}
            field={field}
            idFields={idFields}
            selectedDatabaseId={table.db_id}
            selectedSchemaId={selectedSchemaId}
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
          aria-label={t`Sort`}
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

const updateFieldOrder = (
  fields: Field[],
  oldIndex: number,
  newIndex: number,
) => {
  const fieldOrder = new Array<FieldId>(fields.length);

  fields.forEach((field, prevIndex) => {
    const nextIndex =
      newIndex <= prevIndex && prevIndex < oldIndex
        ? prevIndex + 1 // shift down
        : oldIndex < prevIndex && prevIndex <= newIndex
        ? prevIndex - 1 // shift up
        : prevIndex === oldIndex
        ? newIndex // move dragged column to new location
        : prevIndex; // otherwise, leave it where it is

    fieldOrder[nextIndex] = Number(field.id);
  });

  return fieldOrder;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumnList);
