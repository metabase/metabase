import type { AnchorHTMLAttributes } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Link } from "metabase/common/components/Link";
import { useGetIcon } from "metabase/hooks/use-icon";

import S from "./EntitySmartLink.module.css";
import {
  type SmartLinkEntityRef,
  useSmartLinkEntity,
} from "./use-smart-link-entity";

export type EntitySmartLinkProps = SmartLinkEntityRef & {
  name: string;
  href?: string;
  onNavigate?: (href: string) => void;
} & Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "onMouseUp" | "tabIndex">;

export function EntitySmartLink({
  id,
  model,
  name: label,
  href: fallbackHref,
  onNavigate,
  ...anchorProps
}: EntitySmartLinkProps) {
  const getIcon = useGetIcon();
  const { href, libraryEntity } = useSmartLinkEntity({
    id,
    model,
    href: fallbackHref,
  });
  const name = libraryEntity ? libraryEntity.name : label;
  const linkProps = {
    ...anchorProps,
    target: "_blank",
    rel: "noreferrer",
    "data-testid": "smart-link",
    "data-smart-link": libraryEntity ? "token" : "link",
    className: libraryEntity ? S.token : S.link,
  };
  const content = (
    <>
      {libraryEntity && (
        <EntityIcon
          {...getIcon({ model: libraryEntity.model })}
          size="0.75rem"
          className={S.tokenIcon}
        />
      )}
      {name}
    </>
  );

  if (onNavigate) {
    return (
      <a {...linkProps} onClick={() => onNavigate(href)}>
        {content}
      </a>
    );
  }

  return (
    <Link {...linkProps} to={href}>
      {content}
    </Link>
  );
}
