import classNames from "classnames";
import type React from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { ActionIcon, Box, Flex, Group, Icon, Tooltip } from "metabase/ui";
import type {
  DatasetColumn,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import styles from "./Container.module.css";
import { EmptyDropZone } from "./EmptyDropZone";
import S from "./TableDetailView.module.css";

export interface Props {
  children: React.ReactNode;
  label?: string;
  style?: React.CSSProperties;
  horizontal?: boolean;
  hover?: boolean;
  handleProps?: React.HTMLAttributes<any>;
  scrollable?: boolean;
  shadow?: boolean;
  placeholder?: boolean;
  unstyled?: boolean;
  onClick?(): void;
  onRemove?(): void;
  //
  section: ObjectViewSectionSettings;
  columns: DatasetColumn[];
  onUpdateSection: (update: Partial<ObjectViewSectionSettings>) => void;
  onRemoveSection?: () => void;
  dragHandleProps?: any;
  isDraggingSection?: boolean;
}

// eslint-disable-next-line react/display-name
export const Container = forwardRef<HTMLDivElement, Props>(
  (
    {
      children,
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
      //
      columns,
      section,
      onUpdateSection,
      onRemoveSection,
      ...props
    }: Props,
    ref,
  ) => {
    return (
      <Box
        mt="sm"
        // className={S.ObjectViewSidebarSection}
        {...props}
        ref={ref}
        style={
          {
            ...style,
            "--columns": 1,
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
          S.ObjectViewSidebarSection,
        )}
        onClick={onClick}
        tabIndex={onClick ? 0 : undefined}
        w="100%"
      >
        {/* {label ? (
          <div className={styles.Header}>
            {label}
            <div className={styles.Actions}>
              {onRemove ? <Icon name="trash" onClick={onRemove} /> : undefined}
              <Icon
                name="grabber"
                style={{ cursor: "grab" }}
                role="button"
                tabIndex={0}
                {...handleProps}
              />
            </div>
          </div>
        ) : null} */}
        <Flex align="center" justify="space-between" w="100%">
          <Group gap="xs">
            <Icon
              name="grabber"
              style={{ cursor: "grab", outline: "none" }}
              {...handleProps}
            />
            <EditableText
              initialValue={section.title}
              onChange={(title) => onUpdateSection({ title })}
              style={{
                display: "block",
                fontWeight: "bold",
              }}
            />
          </Group>
          <Group gap="sm" className={S.ObjectViewSidebarSectionActions}>
            <Tooltip label={t`Flow direction`}>
              <ActionIcon
                color="text-medium"
                variant="transparent"
                onClick={() => {
                  onUpdateSection({
                    direction:
                      section.direction === "vertical"
                        ? "horizontal"
                        : "vertical",
                  });
                }}
              >
                <Icon
                  name={
                    section.direction === "vertical"
                      ? "arrow_down"
                      : "arrow_right"
                  }
                  size={14}
                  style={{
                    transform:
                      section.direction === "vertical"
                        ? undefined
                        : "rotate(180deg)",
                  }}
                />
              </ActionIcon>
            </Tooltip>

            {onRemoveSection && (
              <Tooltip label={t`Remove group`}>
                <ActionIcon
                  color="text-medium"
                  variant="transparent"
                  onClick={onRemoveSection}
                >
                  <Icon name="close" />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Flex>

        {section.fields.length === 0 && (
          <EmptyDropZone sectionId={String(section.id)} />
        )}

        {children}
      </Box>
    );
  },
);
