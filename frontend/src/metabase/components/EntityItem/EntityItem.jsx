/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";
import cx from "classnames";

import * as Urls from "metabase/lib/urls";
import EntityMenu from "metabase/components/EntityMenu";
import Swapper from "metabase/core/components/Swapper";
import CheckBox from "metabase/core/components/CheckBox";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/core/components/Icon";
import {
  isPreviewShown,
  isFullyParametrized,
  isItemModel,
  isItemPinned,
} from "metabase/collections/utils";

import {
  EntityIconWrapper,
  EntityItemActions,
  EntityItemSpinner,
  EntityItemWrapper,
  EntityMenuContainer,
} from "./EntityItem.styled";

function EntityIconCheckBox({
  item,
  variant,
  icon,
  pinned,
  selectable,
  selected,
  showCheckbox,
  disabled,
  onToggleSelected,
  ...props
}) {
  const iconSize = variant === "small" ? 12 : 16;
  const handleClick = e => {
    e.preventDefault();
    onToggleSelected();
  };

  return (
    <EntityIconWrapper
      isPinned={pinned}
      model={item.model}
      onClick={selectable ? handleClick : null}
      rounded
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
}

function EntityItemName({ name, variant }) {
  return (
    <h3
      className={cx("overflow-hidden", {
        "text-list": variant === "list",
      })}
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
  onToggleBookmark,
  onTogglePreview,
  className,
  analyticsContext,
}) {
  const isPinned = isItemPinned(item);
  const isPreviewed = isPreviewShown(item);
  const isParametrized = isFullyParametrized(item);
  const isModel = isItemModel(item);
  const isXrayShown = isModel && isXrayEnabled;
  const isMetabotShown = isModel && canUseMetabot;

  const actions = useMemo(
    () =>
      [
        onPin && {
          title: isPinned ? t`Unpin` : t`Pin this`,
          icon: isPinned ? "unpin" : "pin",
          action: onPin,
          event: `${analyticsContext};Entity Item;Pin Item;${item.model}`,
        },
        isMetabotShown && {
          title: t`Ask Metabot`,
          link: Urls.modelMetabot(item.id),
          icon: "insight",
          event: `${analyticsContext};Entity Item;Ask Metabot;${item.model}`,
        },
        isXrayShown && {
          title: t`X-ray this`,
          link: Urls.xrayModel(item.id),
          icon: "bolt",
          event: `${analyticsContext};Entity Item;X-ray Item;${item.model}`,
        },
        onTogglePreview && {
          title: isPreviewed
            ? t`Don’t show visualization`
            : t`Show visualization`,
          icon: isPreviewed ? "eye_crossed_out" : "eye",
          action: onTogglePreview,
          tooltip: !isParametrized
            ? t`Open this question and fill in its variables to see it.`
            : undefined,
          disabled: !isParametrized,
          event: `${analyticsContext};Entity Item;Preview Item;${item.model}`,
        },
        onMove && {
          title: t`Move`,
          icon: "move",
          action: onMove,
          event: `${analyticsContext};Entity Item;Move Item;${item.model}`,
        },
        onCopy && {
          title: t`Duplicate`,
          icon: "clone",
          action: onCopy,
          event: `${analyticsContext};Entity Item;Copy Item;${item.model}`,
        },
        onArchive && {
          title: t`Archive`,
          icon: "archive",
          action: onArchive,
          event: `${analyticsContext};Entity Item;Archive Item;${item.model}`,
        },
        onToggleBookmark && {
          title: isBookmarked ? t`Remove from bookmarks` : t`Bookmark`,
          icon: "bookmark",
          action: onToggleBookmark,
          event: `${analyticsContext};Entity Item;Bookmark Item;${item.model}`,
        },
      ].filter(action => action),
    [
      item.id,
      item.model,
      isPinned,
      isXrayShown,
      isMetabotShown,
      isPreviewed,
      isParametrized,
      isBookmarked,
      onPin,
      onMove,
      onCopy,
      onArchive,
      onTogglePreview,
      onToggleBookmark,
      analyticsContext,
    ],
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <EntityMenuContainer align="center">
      <EntityMenu
        triggerAriaLabel={t`Actions`}
        className={className}
        closedClassNames="hover-child hover-child--smooth"
        triggerIcon="ellipsis"
        items={actions}
      />
    </EntityMenuContainer>
  );
}

const EntityItem = ({
  analyticsContext,
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
}) => {
  const icon = useMemo(() => ({ name: iconName }), [iconName]);

  return (
    <EntityItemWrapper
      className={cx("hover-parent hover--visibility", {
        "bg-light-hover": variant === "list",
      })}
      variant={variant}
      disabled={disabled}
    >
      <EntityIconCheckBox
        item={item}
        variant={variant}
        icon={icon}
        pinned={pinned}
        selectable={selectable}
        selected={selected}
        disabled={disabled}
        onToggleSelected={onToggleSelected}
      />

      <div className="overflow-hidden">
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
          className="ml1"
          analyticsContext={analyticsContext}
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

export default EntityItem;
