import { PointerSensor, useSensor } from "@dnd-kit/core";
import cx from "classnames";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { DragEndEvent } from "metabase/core/components/Sortable";
import { SortableList } from "metabase/core/components/Sortable";
import CS from "metabase/css/core/index.css";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
import type { FieldId, SchemaId } from "metabase-types/api";

import MetadataTableColumn from "../MetadataTableColumn";

interface OwnProps {
  table: Table;
  idFields: Field[];
  selectedSchemaId: SchemaId;
}

interface DispatchProps {
  onUpdateFieldOrder: (table: Table, fieldOrder: FieldId[]) => void;
}

type MetadataTableColumnListProps = OwnProps & DispatchProps;

const mapDispatchToProps: DispatchProps = {
  onUpdateFieldOrder: Tables.actions.setFieldOrder,
};

const getId = (field: Field) => field.getId();

const MetadataTableColumnList = ({
  table,
  idFields,
  selectedSchemaId,
  onUpdateFieldOrder,
}: MetadataTableColumnListProps) => {
  const { fields = [], visibility_type } = table;
  const isHidden = visibility_type != null;

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const sortedFields = useMemo(
    () => _.sortBy(fields, (field) => field.position),
    [fields],
  );

  const handleSortEnd = useCallback(
    ({ itemIds: fieldOrder }: DragEndEvent) => {
      onUpdateFieldOrder(table, fieldOrder as number[]);
    },
    [table, onUpdateFieldOrder],
  );

  const renderItem = ({ item, id }: { item: Field; id: string | number }) => (
    <MetadataTableColumn
      key={id}
      field={item}
      idFields={idFields}
      selectedDatabaseId={table.db_id}
      selectedSchemaId={selectedSchemaId}
      selectedTableId={table.id}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(MetadataTableColumnList);
