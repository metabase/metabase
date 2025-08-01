import cx from "classnames";
import { P, match } from "ts-pattern";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { UnstyledButton } from "metabase/ui";

import S from "./UpsellCta.module.css";

type UpsellCtaProps = {
  onClick: (() => void) | undefined;
  internalLink: string | undefined;
  buttonText: string;
  url: string | undefined;
  onClickCapture: () => void;
  size?: "default" | "large";
};

export function UpsellCta({
  onClick,
  onClickCapture,
  internalLink,
  buttonText,
  url,
  size = "default",
}: UpsellCtaProps) {
  const className = cx(S.UpsellCTALink, {
    [S.Large]: size === "large",
  });

  return match({ onClick, url, internalLink })
    .with(
      {
        onClick: P.nonNullable,
        url: P.any,
        internalLink: P.nullish,
      },
      (args) => (
        <UnstyledButton
          onClick={() => {
            args.onClick();
            onClickCapture?.();
          }}
          className={className}
        >
          {buttonText}
        </UnstyledButton>
      ),
    )
    .with(
      {
        onClick: P.any,
        url: P.nonNullable,
        internalLink: P.nullish,
      },
      () => (
        <ExternalLink
          onClickCapture={onClickCapture}
          href={url}
          className={className}
        >
          {buttonText}
        </ExternalLink>
      ),
    )
    .with(
      {
        onClick: P.any,
        url: P.any,
        internalLink: P.nonNullable,
      },
      (args) => (
        <Link
          onClickCapture={onClickCapture}
          to={args.internalLink}
          className={className}
        >
          {buttonText}
        </Link>
      ),
    )
    .otherwise(() => null);
}
