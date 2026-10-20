import type { MouseEvent } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useToast } from "metabase/common/hooks";
import { Flex, Icon, Menu } from "metabase/ui";
import { openSaveDialog } from "metabase/utils/dom";
import type { Dataset, RowValue } from "metabase-types/api";

import S from "./AnalysisNode.module.css";

type AnalysisCardMenuProps = {
  title: string;
  dataset: Dataset | undefined;
  commentsPath: string;
  canWrite: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

const stopPropagation = (event: MouseEvent) => event.stopPropagation();

/**
 * Laid out like a question card's menu in a document, with one Edit for both
 * the query and the visualization, since one side panel holds both.
 */
export const AnalysisCardMenu = ({
  title,
  dataset,
  commentsPath,
  canWrite,
  onEdit,
  onRemove,
}: AnalysisCardMenuProps) => {
  const [sendToast] = useToast();
  const showComingSoon = () =>
    sendToast({ message: t`Coming soon`, timeout: 3000 });

  return (
    <Menu withinPortal position="bottom-end" data-hide-on-print>
      <Menu.Target>
        <Flex
          component="button"
          p="0.25rem"
          align="center"
          justify="center"
          className={S.menuButton}
          aria-label={t`More options`}
          onClick={stopPropagation}
        >
          <Icon name="ellipsis" size={16} c="text-secondary" />
        </Flex>
      </Menu.Target>
      {/* The dropdown is portaled, but React still bubbles its clicks to the card. */}
      <Menu.Dropdown onClick={stopPropagation}>
        <Menu.Item
          leftSection={<Icon name="pencil" size={14} />}
          disabled={!canWrite}
          onClick={onEdit}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Divider />
        {canWrite && (
          <Menu.Item
            leftSection={<Icon name="add_comment" size={14} />}
            component={ForwardRefLink}
            to={commentsPath}
            disabled={!commentsPath}
          >
            {t`Comment`}
          </Menu.Item>
        )}
        <Menu.Item
          leftSection={<Icon name="add_list" size={14} />}
          disabled={!canWrite}
          onClick={showComingSoon}
        >
          {t`Add supporting text`}
        </Menu.Item>
        {dataset?.data !== undefined && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="download" aria-hidden />}
              onClick={() =>
                openSaveDialog(
                  `${title}.csv`,
                  new Blob([toCsv(dataset)], { type: "text/csv" }),
                )
              }
            >
              {t`Download results`}
            </Menu.Item>
          </>
        )}
        <Menu.Divider />
        <Menu.Item
          leftSection={<Icon name="refresh" size={14} />}
          disabled={!canWrite}
          onClick={showComingSoon}
        >
          {t`Replace`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="trash" size={14} />}
          disabled={!canWrite}
          onClick={onRemove}
        >
          {t`Remove chart`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

const toCsvCell = (value: RowValue): string => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const toCsv = ({ data }: Dataset): string =>
  [data.cols.map((col) => col.display_name), ...data.rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\n");
