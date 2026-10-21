import type { Editor } from "@tiptap/core";
import cx from "classnames";
import {
  type CSSProperties,
  type ComponentPropsWithoutRef,
  forwardRef,
  useState,
} from "react";
import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers";
import { canUserCreateNativeQueries } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { wrapCardEmbed } from "metabase/rich_text_editing/tiptap/extensions/shared/layout";
import { Icon, Menu, Text, UnstyledButton } from "metabase/ui";
import type { CardId, IconName } from "metabase-types/api";

import type { NotebookStartAction } from "../document-page-addon";
import { CreateNativeQuestionModal } from "../editor-extensions/CardEmbed/modals/CreateNativeQuestionModal";
import { CreateStructuredQuestionModal } from "../editor-extensions/CardEmbed/modals/CreateStructuredQuestionModal";

import S from "./NotebookStartActions.module.css";

type OpenModal = "notebook" | "native" | "picker" | null;

type NotebookStartActionsProps = {
  editor: Editor;
  /** Lets the buttons fade and collapse away, e.g. once the notebook has content. */
  style?: CSSProperties;
  /** Actions a feature adds, e.g. a new event analysis, after the queries. */
  extraActions?: NotebookStartAction[];
};

/** Big buttons that start an empty notebook off with a chart. */
export const NotebookStartActions = ({
  editor,
  style,
  extraActions = [],
}: NotebookStartActionsProps) => {
  const [openModal, setOpenModal] = useState<OpenModal>(null);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);

  const insertCard = (id: CardId) => {
    editor
      .chain()
      .focus()
      .insertContent(wrapCardEmbed({ type: "cardEmbed", attrs: { id } }))
      .run();
    setOpenModal(null);
  };

  return (
    <>
      <div className={S.actions} style={style}>
        <StartActionButton
          icon="notebook"
          label={t`New GUI query`}
          onClick={() => setOpenModal("notebook")}
        />
        {hasNativeWrite && (
          <StartActionButton
            icon="sql"
            label={t`New SQL query`}
            onClick={() => setOpenModal("native")}
          />
        )}
        {extraActions.map((action) => (
          <Menu key={action.key} position="bottom">
            <Menu.Target>
              <StartActionButton icon={action.icon} label={action.label} />
            </Menu.Target>
            <Menu.Dropdown>
              {action.options.map((option) => (
                <Menu.Item
                  key={option.key}
                  leftSection={<Icon name={option.icon} />}
                  onClick={option.onSelect}
                >
                  {option.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        ))}
        <StartActionButton
          icon="lineandbar"
          label={t`Insert a chart`}
          onClick={() => setOpenModal("picker")}
        />
      </div>
      {openModal === "notebook" && (
        <CreateStructuredQuestionModal
          onSave={(id) => insertCard(id)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "native" && (
        <CreateNativeQuestionModal
          onSave={(id) => insertCard(id)}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "picker" && (
        <QuestionPickerModal
          onChange={(item) => insertCard(item.id)}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
};

type StartActionButtonProps = ComponentPropsWithoutRef<"button"> & {
  icon: IconName;
  label: string;
};

// Forwards its ref and props so it can be a Menu.Target.
const StartActionButton = forwardRef<HTMLButtonElement, StartActionButtonProps>(
  function StartActionButton({ icon, label, className, ...props }, ref) {
    return (
      <UnstyledButton {...props} ref={ref} className={cx(S.action, className)}>
        <Icon name={icon} size={32} />
        <Text c="inherit" fw="bold" ta="center">
          {label}
        </Text>
      </UnstyledButton>
    );
  },
);
