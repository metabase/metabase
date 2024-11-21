import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { c, t } from "ttag";

import { archiveAndTrack } from "metabase/archive/analytics";
import type {
  OnArchive,
  OnCopy,
  OnDeletePermanently,
  OnMove,
  OnPin,
  OnRestore,
  OnToggleBookmark,
  OnTogglePreview,
  OnToggleSelected,
} from "metabase/collections/types";
import {
  isFullyParameterized,
  isItemModel,
  isItemPinned,
  isPreviewShown,
} from "metabase/collections/utils";
import EntityMenu from "metabase/components/EntityMenu";
import CheckBox from "metabase/core/components/CheckBox";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Swapper from "metabase/core/components/Swapper";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import type { IconName, IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import {
  EntityIconWrapper,
  EntityItemActions,
  EntityItemSpinner,
  EntityItemWrapper,
  EntityMenuContainer,
} from "./EntityItem.styled";

type EntityIconCheckBoxProps = {
  variant?: string;
  icon: IconProps;
  pinned?: boolean;
  selectable?: boolean;
  selected?: boolean;
  showCheckbox?: boolean;
  disabled?: boolean;
  onToggleSelected?: () => void;
};

const EntityIconCheckBox = ({
  variant,
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
  ...props
}: EntityIconCheckBoxProps) => {
  const iconSize = variant === "small" ? 12 : 16;
  const handleClick: React.MouseEventHandler = e => {
    e.preventDefault();
    onToggleSelected?.();
  };

  return (
    <EntityIconWrapper
      isPinned={pinned}
      onClick={selectable ? handleClick : () => {}}
      disabled={disabled}
      {...props}
    >
      {selectable ? (
        <Swapper
          defaultElement={
            <Icon
              name={icon.name}
              color={icon.color ?? "inherit"}
              size={iconSize}
            />
          }
          swappedElement={<CheckBox checked={selected} size={iconSize} />}
          isSwapped={selected || showCheckbox}
        />
      ) : (
        <Icon
          name={icon.name}
          color={icon.color ?? "inherit"}
          size={iconSize}
        />
      )}
    </EntityIconWrapper>
  );
};

function EntityItemName({
  name,
  variant,
  ...props
}: {
  name: string;
  variant?: string;
} & React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cx(CS.overflowHidden, {
        [CS.textList]: variant === "list",
      })}
      {...props}
    >
      <Ellipsified>{name}</Ellipsified>
    </h3>
  );
}

function EntityItemMenu({
  item,
  isBookmarked,
  isXrayEnabled,
  canUseMetabot,
  onPin,
  onMove,
  onCopy,
  onArchive,
  onRestore,
  onDeletePermanently,
  onToggleBookmark,
  onTogglePreview,
  className,
}: {
  item: CollectionItem;
  isBookmarked?: boolean;
  isXrayEnabled?: boolean;
  canUseMetabot?: boolean;
  onPin?: OnPin;
  onMove?: OnMove;
  onCopy?: OnCopy;
  onArchive?: OnArchive;
  onRestore?: OnRestore;
  onDeletePermanently?: OnDeletePermanently;
  onToggleBookmark?: OnToggleBookmark;
  onTogglePreview?: OnTogglePreview;
  className?: string;
}) {
  const isPinned = isItemPinned(item);
  const isPreviewed = isPreviewShown(item);
  const isParameterized = isFullyParameterized(item);
  const isModel = isItemModel(item);
  const isXrayShown = isModel && isXrayEnabled;
  const isMetabotShown = isModel && canUseMetabot;

  const actions = useMemo(() => {
    const result = [];

    if (onPin) {
      result.push({
        title: isPinned ? t`Unpin` : t`Pin this`,
        icon: isPinned ? "unpin" : "pin",
        action: onPin,
      });
    }

    if (onToggleBookmark) {
      result.push({
        title: isBookmarked ? t`Remove from bookmarks` : c("Verb").t`Bookmark`,
        icon: "bookmark",
        action: onToggleBookmark,
      });
    }

    if (isMetabotShown) {
      result.push({
        title: t`Ask Metabot`,
        link: Urls.modelMetabot(item.id),
        icon: "insight",
      });
    }

    if (isXrayShown) {
      result.push({
        title: t`X-ray this`,
        link: Urls.xrayModel(item.id),
        icon: "bolt",
      });
    }

    if (onTogglePreview) {
      result.push({
        title: isPreviewed
          ? t`Don’t show visualization`
          : t`Show visualization`,
        icon: isPreviewed ? "eye_crossed_out" : "eye",
        action: onTogglePreview,
        tooltip: !isParameterized
          ? t`Open this question and fill in its variables to see it.`
          : undefined,
        disabled: !isParameterized,
      });
    }

    if (onCopy) {
      result.push({
        title: c("Verb").t`Duplicate`,
        icon: "clone",
        action: onCopy,
      });
    }

    if (onMove) {
      result.push({
        title: t`Move`,
        icon: "move",
        action: onMove,
      });
    }

    if (onArchive) {
      result.push({
        title: t`Move to trash`,
        icon: "trash",
        action: () =>
          archiveAndTrack({
            archive: onArchive,
            model: item.model,
            modelId: item.id,
            triggeredFrom: "collection",
          }),
      });
    }

    if (onRestore) {
      result.push({
        title: t`Restore`,
        icon: "revert",
        action: onRestore,
      });
    }

    if (onDeletePermanently) {
      result.push({
        title: t`Delete permanently`,
        icon: "trash",
        action: onDeletePermanently,
        color: "danger",
        hoverColor: "danger",
        hoverBgColor: "bg-error",
      });
    }

    return result;
  }, [
    item.id,
    item.model,
    isPinned,
    isXrayShown,
    isMetabotShown,
    isPreviewed,
    isParameterized,
    isBookmarked,
    onPin,
    onMove,
    onCopy,
    onArchive,
    onTogglePreview,
    onToggleBookmark,
    onDeletePermanently,
    onRestore,
  ]);
  if (actions.length === 0) {
    return null;
  }
  return (
    <EntityMenuContainer style={{ textAlign: "center" }}>
      <EntityMenu
        triggerAriaLabel={t`Actions`}
        className={className}
        closedClassNames={cx(CS.hoverChild, CS.hoverChildSmooth)}
        triggerIcon="ellipsis"
        items={actions}
      />
    </EntityMenuContainer>
  );
}

const EntityItem = ({
  name,
  iconName,
  onPin,
  onMove,
  onCopy,
  onArchive,
  selected,
  onToggleSelected,
  selectable,
  variant,
  item,
  buttons,
  extraInfo,
  pinned,
  loading,
  disabled,
}: {
  name: string;
  iconName: IconName;
  onPin?: OnPin;
  onMove?: OnMove;
  onCopy?: OnCopy;
  onArchive?: OnArchive;
  selected?: boolean;
  onToggleSelected?: OnToggleSelected;
  selectable?: boolean;
  variant?: string;
  item: CollectionItem;
  buttons?: ReactNode;
  extraInfo?: ReactNode;
  pinned?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) => {
  const icon = useMemo(() => ({ name: iconName }), [iconName]);

  return (
    <EntityItemWrapper
      className={cx(CS.hoverParent, CS.hoverVisibility, {
        [CS.bgLightHover]: variant === "list",
      })}
      variant={variant}
      disabled={disabled}
    >
      <EntityIconCheckBox
        variant={variant}
        icon={icon}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        disabled={disabled}
        onToggleSelected={onToggleSelected}
      />

      <div className={CS.overflowHidden}>
        <EntityItemName name={name} />
        <div>{extraInfo && extraInfo}</div>
      </div>

      <EntityItemActions onClick={e => e.preventDefault()}>
        {buttons}
        {loading && <EntityItemSpinner size={24} borderWidth={3} />}
        <EntityItemMenu
          item={item}
          onPin={onPin}
          onMove={onMove}
          onCopy={onCopy}
          onArchive={onArchive}
          className={CS.ml1}
        />
      </EntityItemActions>
    </EntityItemWrapper>
  );
};

EntityItem.defaultProps = {
  selectable: false,
};

EntityItem.IconCheckBox = EntityIconCheckBox;
EntityItem.Name = EntityItemName;
EntityItem.Menu = EntityItemMenu;

// eslint-disable-next-line import/no-default-export
export default EntityItem;
