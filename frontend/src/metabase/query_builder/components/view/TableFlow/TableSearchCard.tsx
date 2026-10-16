import cx from "classnames";
import { t } from "ttag";

import { ActionIcon, Icon, TextInput, Tooltip } from "metabase/ui";

import S from "./TableFlow.module.css";

type TableSearchCardProps = {
  searchText: string;
  isGalleryOpen: boolean;
  canShowGallery: boolean;
  onSearchTextChange: (searchText: string) => void;
  onGalleryToggle: () => void;
};

export function TableSearchCard({
  searchText,
  isGalleryOpen,
  canShowGallery,
  onSearchTextChange,
  onGalleryToggle,
}: TableSearchCardProps) {
  return (
    <div className={cx(S.card, S.searchCard)}>
      <TextInput
        className={S.searchInput}
        variant="unstyled"
        value={searchText}
        placeholder={t`Search this table…`}
        leftSection={<Icon name="search" />}
        aria-label={t`Search this table`}
        onChange={(event) => onSearchTextChange(event.currentTarget.value)}
      />
      {canShowGallery && (
        <Tooltip label={t`Gallery`}>
          <ActionIcon
            size="lg"
            variant={isGalleryOpen ? "filled" : "viewHeader"}
            aria-label={t`Gallery`}
            aria-pressed={isGalleryOpen}
            onClick={onGalleryToggle}
          >
            <Icon name="image" />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
