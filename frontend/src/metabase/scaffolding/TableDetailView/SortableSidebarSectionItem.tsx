import { Sortable } from "metabase/common/components/Sortable/Sortable";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  SectionVariant,
} from "metabase-types/api";

import { SidebarSectionItem } from "./SidebarSectionItem";

interface SortableSidebarSectionItemProps {
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  fieldsLimit?: number;
  onUpdateSection?: (
    sectionId: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => void;
  onRemoveSection?: (sectionId: number) => void;
  openPopoverId: number | null;
  setOpenPopoverId?: (id: number | null) => void;
  variant: SectionVariant;
  showDragHandle?: boolean;
}

export function SortableSidebarSectionItem({
  section,
  columns,
  fieldsLimit,
  onUpdateSection,
  onRemoveSection,
  openPopoverId,
  setOpenPopoverId,
  variant,
  showDragHandle,
}: SortableSidebarSectionItemProps) {
  return (
    <Sortable id={section.id}>
      {({ dragHandleRef, dragHandleListeners }) => (
        <SidebarSectionItem
          section={section}
          columns={columns}
          fieldsLimit={fieldsLimit}
          onUpdateSection={onUpdateSection}
          onRemoveSection={onRemoveSection}
          openPopoverId={openPopoverId}
          setOpenPopoverId={setOpenPopoverId}
          variant={variant}
          showDragHandle={showDragHandle}
          dragHandleRef={dragHandleRef}
          dragHandleListeners={dragHandleListeners}
        />
      )}
    </Sortable>
  );
}
