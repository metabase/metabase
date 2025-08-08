import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  type UniqueIdentifier,
  closestCenter,
  defaultDropAnimationSideEffects,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type AnimateLayoutChanges,
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import classNames from "classnames";
import {
  type CSSProperties,
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, unstable_batchedUpdates } from "react-dom";
import { push } from "react-router-redux";
import { useMount } from "react-use";
import { t } from "ttag";

import { useUpdateTableComponentSettingsMutation } from "metabase/api/table";
import { useDispatch } from "metabase/lib/redux";
import { question } from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { closeNavbar } from "metabase/redux/app";
import {
  Box,
  Button,
  Flex,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui/components";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import { isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
  RowValues,
} from "metabase-types/api";

import { getDefaultObjectViewSettings } from "../utils";

import { DetailViewContainer } from "./DetailViewContainer";
import { ObjectViewSection } from "./ObjectViewSection";
import { SortableSection } from "./SortableSection";
import styles from "./dnd-styles.module.css";
import { useDetailViewSections } from "./use-detail-view-sections";
import { useForeignKeyReferences } from "./use-foreign-key-references";

interface TableDetailViewProps {
  tableId: number;
  rowId: number | string;
  row: RowValues;
  columns: DatasetColumn[];
  table: any;
  tableForeignKeys: any[];
  isEdit: boolean;
  onPreviousItemClick?: () => void;
  onNextItemClick?: () => void;
}

export const TRASH_ID = "void";
const PLACEHOLDER_ID = "placeholder";
const empty: UniqueIdentifier[] = [];

export function TableDetailViewInner({
  tableId,
  rowId,
  row,
  columns,
  table,
  tableForeignKeys,
  isEdit = false,
  onPreviousItemClick,
  onNextItemClick,
}: TableDetailViewProps) {
  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);
  const [_hoveredSectionIdMain, setHoveredSectionIdMain] = useState<
    number | null
  >(null);
  const [_hoveredSectionIdSidebar, setHoveredSectionIdSidebar] = useState<
    number | null
  >(null);
  const hoveredSectionIdMain = null;
  const hoveredSectionIdSidebar = null;
  const dispatch = useDispatch();
  const [updateTableComponentSettings] =
    useUpdateTableComponentSettingsMutation();

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  // const [items, setItems] = useState(sections);

  const { tableForeignKeyReferences } = useForeignKeyReferences({
    tableForeignKeys,
    row,
    columns,
    tableDatabaseId: table.database_id,
  });

  const defaultSections = useMemo(
    () => getDefaultObjectViewSettings(table).sections,
    [table],
  );

  const initialSections = useMemo(() => {
    const savedSettingsSections =
      table?.component_settings?.object_view?.sections;

    return savedSettingsSections && savedSettingsSections.length > 0
      ? savedSettingsSections
      : defaultSections;
  }, [table?.component_settings?.object_view?.sections, defaultSections]);

  const {
    sections,
    createSection,
    updateSection,
    updateSections,
    removeSection,
    // handleDragEnd,
  } = useDetailViewSections(initialSections);

  const notEmptySections = useMemo(() => {
    return sections.filter((section) => section.fields.length > 0);
  }, [sections]);

  const [containers, setContainers] = useState(
    sections.map((section) => section.id),
  );

  useEffect(() => {
    setContainers(sections.map((section) => section.id));
  }, [sections]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id);
    // setClonedItems(items);
  };

  /**
   * Custom collision detection strategy optimized for multiple containers
   *
   * - First, find any droppable containers intersecting with the pointer.
   * - If there are none, find intersecting containers with the active draggable.
   * - If there are no intersecting containers, return the last matched intersection
   *
   */
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      if (activeId && sections.some((s) => s.id === activeId)) {
        const center = closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((container) =>
            sections.some((s) => s.id === container.id),
          ),
        });

        console.log("__DEBUG__", { center });

        return center;
      }

      console.log("__DEBUG__", { args });

      // Start by finding any intersecting droppable
      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0
          ? // If there are droppables intersecting with the pointer, return those
            pointerIntersections
          : rectIntersection(args);
      let overId = getFirstCollision(intersections, "id");

      if (overId != null) {
        if (overId === TRASH_ID) {
          // If the intersecting droppable is the trash, return early
          // Remove this if you're not using trashable functionality in your app
          return intersections;
        }

        if (sections.some((s) => s.id === overId)) {
          const containerItems = sections
            .find((s) => s.id === overId)
            ?.fields.map((f) => f.field_id);

          // If a container is matched and it contains items (columns 'A', 'B', 'C')
          if (containerItems && containerItems.length > 0) {
            // console.log('container items', containerItems);
            // Return the closest droppable within that container
            overId = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  container.id !== overId &&
                  containerItems.includes(container.id),
              ),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;

        return [{ id: overId }];
      }

      // When a draggable item moves to a new container, the layout may shift
      // and the `overId` may become `null`. We manually set the cached `lastOverId`
      // to the id of the draggable item that was moved to the new container, otherwise
      // the previous `overId` will be returned which can cause items to incorrectly shift positions
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      // If no droppable is matched, return the last match
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId, sections],
  );

  function getNextContainerId() {
    const containerIds = sections.map((s) => s.id);
    const lastContainerId = containerIds.at(-1);

    return lastContainerId ? lastContainerId + 1 : Date.now();
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // console.log("handle drag end!")

    // if (over && String(active.id) !== String(over.id)) {
    //   updateSections((sections) => {
    //     const oldIndex = sections.findIndex(
    //       (section) => String(section.id) === String(active.id),
    //     );
    //     const newIndex = sections.findIndex(
    //       (section) => String(section.id) === String(over.id),
    //     );

    //     return arrayMove(sections, oldIndex, newIndex);
    //   });
    // }

    const isDraggingSection = sections.some((s) => s.id === active.id);
    // console.log({ isDraggingSection })
    if (isDraggingSection && over?.id) {
      setContainers((containers) => {
        const activeIndex = containers.indexOf(active.id);
        const overIndex = containers.indexOf(over.id);

        return arrayMove(containers, activeIndex, overIndex);
      });
    }

    const activeContainer = findContainer(active.id);

    // console.log({ activeContainer });

    if (!activeContainer) {
      setActiveId(null);
      return;
    }

    const overId = over?.id;

    if (overId == null) {
      setActiveId(null);
      return;
    }

    // console.log({ activeContainer, overId });

    if (overId === TRASH_ID) {
      // setItems((items) => ({
      //   ...items,
      //   [activeContainer]: items[activeContainer].filter(
      //     (id) => id !== activeId
      //   ),
      // }));
      setActiveId(null);
      return;
    }

    if (overId === PLACEHOLDER_ID) {
      const newContainerId = getNextContainerId();

      unstable_batchedUpdates(() => {
        setContainers((containers) => [...containers, newContainerId]);
        // setItems((items) => ({
        //   ...items,
        //   [activeContainer]: items[activeContainer].filter(
        //     (id) => id !== activeId
        //   ),
        //   [newContainerId]: [active.id],
        // }));
        setActiveId(null);
      });
      return;
    }

    const overContainer = findContainer(overId);

    // console.log({ overContainer });

    if (overContainer) {
      const overSection = sections.find((s) => s.id === overContainer);
      const activeSection = sections.find((s) => s.id === activeContainer);

      if (!overSection || !activeSection) {
        return;
      }

      // field index
      const activeIndex = activeSection.fields.findIndex(
        (f) => f.field_id === active.id,
      );
      const overIndex = overSection.fields.findIndex(
        (f) => f.field_id === overId,
      );

      // if (overSection.id === activeSection.id) {
      //   console.log("same section, add sorting");
      //   return;
      // }

      // console.log({ activeIndex, overIndex })

      if (activeIndex !== overIndex) {
        // TODO: move field between sections
        console.log("move fields between sections", { activeIndex, overIndex });

        // find active section, over section
        // remove active field from active section
        // add active field to over section
        // update sections
        updateSections((sections) => {
          const newSections = [...sections];

          const newOverSection = {
            ...overSection,
            fields: arrayMove(overSection.fields, activeIndex, overIndex),
          };

          const overSectionIndex = newSections.findIndex(
            (s) => s.id === overContainer,
          );
          newSections[overSectionIndex] = newOverSection;

          return newSections;
        });
      }
    }

    setActiveId(null);
  };

  const findContainer = (id: UniqueIdentifier) => {
    if (sections.some((s) => s.id === id)) {
      return id;
    }

    // console.error("find field");
    return sections.find((s) => s.fields.some((f) => f.field_id === id))?.id;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    const overId = over?.id;

    const isDraggingSection = sections.some((s) => s.id === active.id);
    if (overId == null || overId === TRASH_ID || isDraggingSection) {
      return;
    }

    const overContainer = findContainer(overId);
    const activeContainer = findContainer(active.id);

    // console.log({ activeContainer, overContainer });

    if (!overContainer || !activeContainer) {
      return;
    }

    if (activeContainer !== overContainer) {
      console.log("drag fields between sections");

      updateSections((sections) => {
        // const newSections = [...sections];
        // const activeSection = newSections.find((s) => s.id === activeContainer);
        // const overSection = newSections.find((s) => s.id === overContainer);
        const activeSection = sections.find((s) => s.id === activeContainer);
        const overSection = sections.find((s) => s.id === overContainer);
        const overItems = overSection?.fields.map((f) => f.field_id);
        const overIndex = overItems?.indexOf(overId);

        console.log("__DEBUG__", { overItems, overIndex });

        if (!activeSection || !overSection) {
          return sections;
        }

        const activeField = activeSection.fields.find(
          (f) => f.field_id === active.id,
        );
        const overField = overSection.fields.find((f) => f.field_id === overId);

        let newIndex: number;
        if (sections.some((s) => s.id === active.id)) {
          newIndex = sections.length + 1;
        } else {
          const isBelowOverItem =
            over &&
            active.rect.current.translated &&
            active.rect.current.translated.top >
              over.rect.top + over.rect.height;

          const modifier = isBelowOverItem ? 1 : 0;

          newIndex =
            overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
        }

        console.log("__DEBUG__", { newIndex });

        recentlyMovedToNewContainer.current = true;

        const newSections = [...sections];

        // remove item from active section
        // add item to over section
        // update sections

        const newActiveSection = {
          ...activeSection,
          fields: activeSection.fields.filter((f) => f.field_id !== active.id),
        };

        const newOverSection = {
          ...overSection,
          fields: [
            ...overSection.fields.slice(0, newIndex),
            activeField,
            ...overSection.fields.slice(newIndex),
          ],
        };

        const activeSectionIndex = newSections.findIndex(
          (s) => s.id === activeContainer,
        );
        const overSectionIndex = newSections.findIndex(
          (s) => s.id === overContainer,
        );

        newSections[activeSectionIndex] = newActiveSection;
        newSections[overSectionIndex] = newOverSection;

        console.log("__DEBUG__", { newSections });

        return newSections;
      });

      // setItems((items) => {
      //   const activeItems = items[activeContainer];
      //   const overItems = items[overContainer];
      //   const overIndex = overItems.indexOf(overId);
      //   const activeIndex = activeItems.indexOf(active.id);

      //   let newIndex: number;

      //   if (overId in items) {
      //     newIndex = overItems.length + 1;
      //   } else {
      //     const isBelowOverItem =
      //       over &&
      //       active.rect.current.translated &&
      //       active.rect.current.translated.top >
      //       over.rect.top + over.rect.height;

      //     const modifier = isBelowOverItem ? 1 : 0;

      //     newIndex =
      //       overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      //   }

      //   recentlyMovedToNewContainer.current = true;

      //   return {
      //     ...items,
      //     [activeContainer]: items[activeContainer].filter(
      //       (item) => item !== active.id
      //     ),
      //     [overContainer]: [
      //       ...items[overContainer].slice(0, newIndex),
      //       items[activeContainer][activeIndex],
      //       ...items[overContainer].slice(
      //         newIndex,
      //         items[overContainer].length
      //       ),
      //     ],
      //   };
      // });
    }
  };

  const fieldsInSections = notEmptySections.flatMap((s) => s.fields);
  const fieldsInSectionsIds = fieldsInSections.map((f) => f.field_id);
  const fields = table?.fields ?? [];
  const fieldIds = fields.map(getRawTableFieldId);
  const uncategorizedSection: ObjectViewSectionSettings = {
    id: -1,
    title: "",
    variant: "normal",
    fields: fieldIds
      .filter((id: number) => {
        return !fieldsInSectionsIds.includes(id);
      })
      .map((field_id: number) => ({ field_id })),
  };
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.5",
        },
      },
    }),
  };

  const handleEditClick = useCallback(() => {
    dispatch(push(`/table/${tableId}/detail/${rowId}/edit`));
  }, [tableId, rowId, dispatch]);

  const handleCloseClick = useCallback(() => {
    dispatch(push(`/table/${tableId}/detail/${rowId}`));
  }, [tableId, rowId, dispatch]);

  const handleSaveClick = useCallback(async () => {
    try {
      await updateTableComponentSettings({
        id: tableId,
        component_settings: {
          ...table?.component_settings,
          object_view: {
            sections: sections,
          },
        },
      }).unwrap();

      dispatch(push(`/table/${tableId}/detail/${rowId}`));
    } catch (error) {
      console.error("Failed to save component settings:", error);
    }
  }, [
    updateTableComponentSettings,
    tableId,
    table?.component_settings,
    sections,
    dispatch,
    rowId,
  ]);

  // Handle foreign key navigation
  const handleFollowForeignKey = useCallback(
    (fk: ForeignKey) => {
      const pkIndex = columns.findIndex(isPK);
      if (pkIndex === -1) {
        return;
      }

      const objectId = row[pkIndex];
      if (objectId == null) {
        return;
      }

      // Navigate to a question with the foreign key filter
      if (fk.origin?.table_id) {
        // Create a card with the foreign key query
        const card = {
          type: "question" as const,
          dataset_query: {
            type: "query" as const,
            query: {
              "source-table": fk.origin.table_id,
              filter: ["=", ["field", fk.origin.id, null], objectId],
            },
            database: fk.origin.table?.db_id || table.database_id,
          },
        } as any;

        // Navigate to the question URL with the card as hash
        const questionUrl = question(card, { hash: card });
        dispatch(push(questionUrl));
      }
    },
    [row, columns, table.database_id, dispatch],
  );

  useMount(() => {
    dispatch(closeNavbar());
  });

  const nameIndex = columns.findIndex(isEntityName);
  const rowName = nameIndex == null ? null : String(row[nameIndex] || "");

  const hasRelationships = tableForeignKeys.length > 0;

  function renderContainerDragOverlay(containerId: UniqueIdentifier) {
    console.log("renderContainerDragOverlay", containerId);
    console.log("__DEBUG__", {
      fields: sections.find((s) => s.id === containerId)?.fields,
    });
    return (
      <Box w="100%" h="100%" style={{ border: "1px dotted purple" }}>
        Section {containerId}
      </Box>
    );
    // return (
    //   <Container
    //     label={`Column ${containerId}`}
    //     columns={columns}
    //     style={{
    //       height: '100%',
    //     }}
    //     shadow
    //     unstyled={false}
    //   >
    //     {sections.find((s) => s.id === containerId)?.fields.map((item, index) => (
    //       <Item
    //         key={item.field_id}
    //         value={item.field_id}
    //       // handle={false}
    //       // style={getItemStyles({
    //       //   containerId,
    //       //   overIndex: -1,
    //       //   index: getIndex(item),
    //       //   value: item,
    //       //   isDragging: false,
    //       //   isSorting: false,
    //       //   isDragOverlay: false,
    //       // })}
    //       // color={getColor(item)}
    //       // wrapperStyle={wrapperStyle({ index })}
    //       // renderItem={renderItem}
    //       />
    //     ))}
    //   </Container>
    // );
  }

  function renderSortableItemDragOverlay(id: UniqueIdentifier) {
    console.log("renderSortableItemDragOverlay", id);
    // const field = fields.find((f) => f.id === id);
    // return <Box w="100%" h="100%" style={{ border: "1px dotted purple" }}>field {id}</Box>
    return (
      <Item
        value={id}
        handle={false}
        // style={getItemStyles({
        //   containerId: findContainer(id) as UniqueIdentifier,
        //   overIndex: -1,
        //   index: getIndex(id),
        //   value: id,
        //   isSorting: true,
        //   isDragging: true,
        //   isDragOverlay: true,
        // })}
        // color={getColor(id)}
        // wrapperStyle={wrapperStyle({ index: 0 })}
        // renderItem={renderItem}
        dragOverlay
      />
    );
  }

  console.log(sections);

  return (
    <DetailViewContainer
      rowId={rowId}
      rowName={rowName}
      table={table}
      row={row}
      isEdit={isEdit}
      columns={columns}
      sections={sections}
      tableForeignKeys={tableForeignKeys}
      tableForeignKeyReferences={tableForeignKeyReferences}
      openPopoverId={openPopoverId}
      setOpenPopoverId={setOpenPopoverId}
      hasRelationships={hasRelationships}
      onEditClick={handleEditClick}
      onPreviousItemClick={onPreviousItemClick}
      onNextItemClick={onNextItemClick}
      onCloseClick={handleCloseClick}
      onSaveClick={handleSaveClick}
      onCreateSection={createSection}
      onUpdateSection={updateSection}
      onUpdateSections={updateSections}
      onRemoveSection={removeSection}
      onDragEnd={handleDragEnd}
      onCancel={handleCloseClick}
      onSubmit={handleSaveClick}
      onFollowForeignKey={handleFollowForeignKey}
      hoveredSectionId={hoveredSectionIdMain}
      setHoveredSectionId={setHoveredSectionIdSidebar}
    >
      <Stack
        gap="md"
        // px="lg"
        // py="xl"
        // bg="white"
        // style={{
        //   border: "1px solid var(--mb-color-border)",
        //   borderRadius: "var(--mantine-radius-md)",
        //   overflow: "hidden",
        // }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          // important for section dnd
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
        >
          <SortableContext
            disabled={!isEdit}
            items={[...containers, PLACEHOLDER_ID]}
            strategy={verticalListSortingStrategy}
          >
            {(isEdit ? containers : containers).map((containerId, _index) => {
              const section = sections.find((s) => s.id === containerId);
              if (!section) {
                console.error(`Section ${containerId} not found`);
                return null;
              }

              return (
                <DroppableContainer
                  key={containerId}
                  id={containerId}
                  label={`Column ${containerId}`}
                  columns={1}
                  items={section.fields}
                  disabled={!isEdit}
                  style={{}}
                  // scrollable={scrollable}
                  // style={containerStyle}
                  // unstyled={minimal}
                  // onRemove={() => handleRemove(containerId)}
                >
                  <Fragment key={section.id}>
                    {/* {index > 0 &&
              (section.variant === "normal" ||
                section.variant === "highlight-2") && (
                <Divider my={0} mx="md" />
              )} */}
                    <ObjectViewSection
                      section={section}
                      sections={sections}
                      variant={section.variant}
                      columns={columns}
                      row={row}
                      tableId={tableId}
                      isEdit={isEdit}
                      onUpdateSection={(update) =>
                        updateSection(section.id, update)
                      }
                      onRemoveSection={
                        section.variant === "header" ||
                        section.variant === "subheader"
                          ? undefined
                          : () => removeSection(section.id)
                      }
                      table={table}
                      isHovered={
                        isEdit &&
                        (hoveredSectionIdMain === section.id ||
                          hoveredSectionIdSidebar === section.id)
                      }
                    />
                  </Fragment>
                </DroppableContainer>
              );
            })}

            <DroppableContainer
              id={PLACEHOLDER_ID}
              disabled={!isEdit}
              items={empty}
              style={{}}
              // onClick={handleAddColumn}
              placeholder
            >
              {t`+ Add column`}
            </DroppableContainer>

            {isEdit && (
              <Flex align="center" justify="center" w="100%">
                <Tooltip label={t`Add group`}>
                  <Button
                    leftSection={<Icon name="add" />}
                    onClick={() => createSection({ position: "end" })}
                  />
                </Tooltip>
              </Flex>
            )}

            {/* {notEmptySections.length > 0 &&
              uncategorizedSection.fields.length > 0 && (
                <Divider my={0} mx="md" />
              )} */}
            {uncategorizedSection.fields.length > 0 && (
              <SortableSection
                section={uncategorizedSection}
                sections={sections}
                variant={uncategorizedSection.variant}
                columns={columns}
                row={row}
                tableId={tableId}
                table={table}
                isEdit={isEdit}
                // onUpdateSection={(update) => updateSection(section.id, update)}
                // onRemoveSection={
                //   notEmptySections.length > 1
                //     ? () => removeSection(section.id)
                //     : undefined
                // }
              />
            )}
          </SortableContext>
          {createPortal(
            <DragOverlay adjustScale={false} dropAnimation={dropAnimation}>
              {activeId
                ? containers.includes(activeId)
                  ? renderContainerDragOverlay(activeId)
                  : renderSortableItemDragOverlay(activeId)
                : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </Stack>
    </DetailViewContainer>
  );
}

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

function DroppableContainer({
  children,
  columns = 1,
  disabled,
  id,
  items,
  style,
  ...props
}) {
  const {
    active,
    attributes,
    isDragging,
    listeners,
    over,
    setNodeRef,
    transition,
    transform,
  } = useSortable({
    id,
    data: {
      type: "container",
      children: items,
    },
    animateLayoutChanges,
    disabled,
  });

  const isOverContainer = over
    ? (id === over.id && active?.data.current?.type !== "container") ||
      items.includes(over.id)
    : false;

  return (
    <Container
      ref={disabled ? undefined : setNodeRef}
      style={{
        ...style,
        transition,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : undefined,
      }}
      hover={isOverContainer}
      handleProps={
        disabled
          ? undefined
          : {
              ...attributes,
              ...listeners,
            }
      }
      columns={columns}
      {...props}
    >
      {children}
    </Container>
  );
}

const Container = forwardRef(
  (
    {
      children,
      columns = 1,
      handleProps,
      horizontal,
      hover,
      onClick,
      onRemove,
      label,
      placeholder,
      style,
      scrollable,
      shadow,
      unstyled,
      ...props
    },
    ref,
  ) => {
    return (
      <Box
        {...props}
        ref={ref}
        style={
          {
            ...style,
            "--columns": columns,
          } as React.CSSProperties
        }
        className={classNames(
          styles.Container,
          unstyled && styles.unstyled,
          horizontal && styles.horizontal,
          hover && styles.hover,
          placeholder && styles.placeholder,
          scrollable && styles.scrollable,
          shadow && styles.shadow,
        )}
        onClick={onClick}
        tabIndex={onClick ? 0 : undefined}
      >
        {label ? (
          <div className={styles.Header}>
            {label}
            <div className={styles.Actions}>
              {onRemove ? <Remove onClick={onRemove} /> : undefined}
              <Handle {...handleProps} />
            </div>
          </div>
        ) : null}
        {placeholder ? children : <ul>{children}</ul>}
      </Box>
    );
  },
);

export const Handle = forwardRef<HTMLButtonElement, ActionProps>(
  (props, ref) => {
    return (
      <Action
        ref={ref}
        cursor="grab"
        data-cypress="draggable-handle"
        {...props}
      >
        <svg viewBox="0 0 20 20" width="12">
          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
        </svg>
      </Action>
    );
  },
);

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props}
      active={{
        // eslint-disable-next-line no-color-literals
        fill: "rgba(255, 70, 70, 0.95)",
        // eslint-disable-next-line no-color-literals
        background: "rgba(255, 70, 70, 0.1)",
      }}
    >
      <svg width="8" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.99998 -0.000206962C2.7441 -0.000206962 2.48794 0.0972617 2.29294 0.292762L0.292945 2.29276C-0.0980552 2.68376 -0.0980552 3.31682 0.292945 3.70682L7.58591 10.9998L0.292945 18.2928C-0.0980552 18.6838 -0.0980552 19.3168 0.292945 19.7068L2.29294 21.7068C2.68394 22.0978 3.31701 22.0978 3.70701 21.7068L11 14.4139L18.2929 21.7068C18.6829 22.0978 19.317 22.0978 19.707 21.7068L21.707 19.7068C22.098 19.3158 22.098 18.6828 21.707 18.2928L14.414 10.9998L21.707 3.70682C22.098 3.31682 22.098 2.68276 21.707 2.29276L19.707 0.292762C19.316 -0.0982383 18.6829 -0.0982383 18.2929 0.292762L11 7.58573L3.70701 0.292762C3.51151 0.0972617 3.25585 -0.000206962 2.99998 -0.000206962Z" />
      </svg>
    </Action>
  );
}

export const Action = forwardRef<HTMLButtonElement, Props>(
  ({ active, className, cursor, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        className={classNames(styles.Action, className)}
        tabIndex={0}
        style={
          {
            ...style,
            cursor,
            "--fill": active?.fill,
            "--background": active?.background,
          } as CSSProperties
        }
      />
    );
  },
);

export const Item = memo(
  forwardRef<HTMLLIElement, Props>(
    (
      {
        color,
        dragOverlay,
        dragging,
        disabled,
        fadeIn,
        handle,
        handleProps,
        height,
        index,
        listeners,
        onRemove,
        renderItem,
        sorting,
        style,
        transition,
        transform,
        value,
        wrapperStyle,
        ...props
      },
      ref,
    ) => {
      useEffect(() => {
        if (!dragOverlay) {
          return;
        }

        document.body.style.cursor = "grabbing";

        return () => {
          document.body.style.cursor = "";
        };
      }, [dragOverlay]);

      return renderItem ? (
        renderItem({
          dragOverlay: Boolean(dragOverlay),
          dragging: Boolean(dragging),
          sorting: Boolean(sorting),
          index,
          fadeIn: Boolean(fadeIn),
          listeners,
          ref,
          style,
          transform,
          transition,
          value,
        })
      ) : (
        <li
          className={classNames(
            styles.Wrapper,
            fadeIn && styles.fadeIn,
            sorting && styles.sorting,
            dragOverlay && styles.dragOverlay,
          )}
          style={
            {
              ...wrapperStyle,
              transition: [transition, wrapperStyle?.transition]
                .filter(Boolean)
                .join(", "),
              "--translate-x": transform
                ? `${Math.round(transform.x)}px`
                : undefined,
              "--translate-y": transform
                ? `${Math.round(transform.y)}px`
                : undefined,
              "--scale-x": transform?.scaleX
                ? `${transform.scaleX}`
                : undefined,
              "--scale-y": transform?.scaleY
                ? `${transform.scaleY}`
                : undefined,
              "--index": index,
              "--color": color,
            } as React.CSSProperties
          }
          ref={ref}
        >
          <div
            className={classNames(
              styles.Item,
              dragging && styles.dragging,
              handle && styles.withHandle,
              dragOverlay && styles.dragOverlay,
              disabled && styles.disabled,
              color && styles.color,
            )}
            style={style}
            data-cypress="draggable-item"
            {...(!handle ? listeners : undefined)}
            {...props}
            tabIndex={!handle ? 0 : undefined}
          >
            {value}
            <span className={styles.Actions}>
              {onRemove ? (
                <Remove className={styles.Remove} onClick={onRemove} />
              ) : null}
              {handle ? <Handle {...handleProps} {...listeners} /> : null}
            </span>
          </div>
        </li>
      );
    },
  ),
);
