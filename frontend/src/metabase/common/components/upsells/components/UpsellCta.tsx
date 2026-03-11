import cx from "classnames";
import { P, match } from "ts-pattern";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { UnstyledButton } from "metabase/ui";

import S from "./UpsellCta.module.css";

type UpsellCtaProps = {
  onClick: (() => void) | undefined;
  internalLink: string | undefined;
  buttonText: string;
  url: string | undefined;
  onClickCapture: () => void;
  size?: "default" | "large";
  className?: string;
  style?: React.CSSProperties;
};

export function UpsellCta({
  onClick,
  onClickCapture,
  internalLink,
  buttonText,
  url,
  size = "default",
  className,
  style,
}: UpsellCtaProps) {
  const finalClassnames = cx(S.UpsellCTALink, className, {
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
          className={finalClassnames}
          style={style}
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
          className={finalClassnames}
          style={style}
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
          className={finalClassnames}
          style={style}
        >
          {buttonText}
        </Link>
      ),
    )
    .otherwise(() => null);
}
