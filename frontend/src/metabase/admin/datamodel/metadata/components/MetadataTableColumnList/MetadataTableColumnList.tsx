import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSensor, PointerSensor } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";
import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Grabber from "metabase/components/Grabber";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import AccordionList from "metabase/core/components/AccordionList";
import type { DragEndEvent } from "metabase/core/components/Sortable";
import { SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import { Icon } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { FieldId, SchemaId, TableFieldOrder } from "metabase-types/api";

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

type MetadataTableColumnListProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateTable: Tables.actions.updateProperty,
  onUpdateFieldOrder: Tables.actions.setFieldOrder,
};

const getId = (field: Field) => field.getId();

const MetadataTableColumnList = ({
  table,
  idFields,
  selectedSchemaId,
  onUpdateTable,
  onUpdateFieldOrder,
}: MetadataTableColumnListProps) => {
  const { fields = [], visibility_type } = table;
  const isHidden = visibility_type != null;

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const sortedFields = useMemo(
    () => _.sortBy(fields, field => field.position),
    [fields],
  );

  const handleSortEnd = useCallback(
    ({ itemIds: fieldOrder }: DragEndEvent) => {
      onUpdateFieldOrder(table, fieldOrder as number[]);
    },
    [table, onUpdateFieldOrder],
  );

  const renderItem = ({ item, id }: { item: Field; id: string | number }) => (
    <SortableColumn
      key={`sortable-${id}`}
      id={id}
      field={item}
      idFields={idFields}
      table={table}
      selectedSchemaId={selectedSchemaId}
    />
  );

  return (
    <div id="ColumnsList" className={cx(CS.mt3, { disabled: isHidden })}>
      <div className={cx(CS.textUppercase, CS.textMedium, CS.py1)}>
        <div className={CS.relative}>
          <div
            style={{ minWidth: 420 }}
            className={cx(CS.floatLeft, CS.px1)}
          >{t`Column`}</div>
          <div className={CS.flex}>
            <div className={cx(CS.flexHalf, CS.pl3)}>{t`Visibility`}</div>
            <div className={CS.flexHalf}>
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
      <div>
        <SortableList
          items={sortedFields}
          renderItem={renderItem}
          getId={getId}
          onSortEnd={handleSortEnd}
          sensors={[pointerSensor]}
          useDragOverlay={false}
        />
      </div>
    </div>
  );
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
          className={cx(CS.textBrand, CS.textBold)}
          style={{ textTransform: "none", letterSpacing: 0 }}
          aria-label={t`Sort`}
        >
          <Icon
            className={CS.ml1}
            name="sort_arrows"
            size={14}
            style={{ transform: "translateY(2px)" }}
          />
        </span>
      }
      popoverContent={({ closePopover }) => (
        <AccordionList
          className={CS.textBrand}
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

interface SortableColumnProps {
  id: UniqueIdentifier;
  field: Field;
  idFields: Field[];
  table: Table;
  selectedSchemaId: SchemaId;
}

const SortableColumn = ({
  id,
  field,
  table,
  idFields,
  selectedSchemaId,
}: SortableColumnProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
  });

  const dragHandle = (
    <Grabber style={{ width: 10 }} {...attributes} {...listeners} />
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "relative",
        zIndex: isDragging ? 100 : 1,
      }}
    >
      <MetadataTableColumn
        field={field}
        idFields={idFields}
        selectedDatabaseId={table.db_id}
        selectedSchemaId={selectedSchemaId}
        selectedTableId={table.id}
        dragHandle={dragHandle}
      />
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumnList);
