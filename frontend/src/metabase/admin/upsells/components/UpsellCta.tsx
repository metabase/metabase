import { P, match } from "ts-pattern";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { UnstyledButton } from "metabase/ui";

import S from "./Upsells.module.css";

type UpsellCtaProps = {
  onClick: (() => void) | undefined;
  buttonLink: string | undefined;
  internalLink: string | undefined;
  buttonText: string;
  url: string | undefined;
  onClickCapture: () => void;
};

export function UpsellCta({
  onClick,
  onClickCapture,
  buttonLink,
  internalLink,
  buttonText,
  url,
}: UpsellCtaProps) {
  return match({ onClick, buttonLink, internalLink })
    .with(
      {
        onClick: P.nonNullable,
        buttonLink: P.any,
        internalLink: P.nullish,
      },
      (args) => (
        <UnstyledButton
          onClick={() => {
            args.onClick();
            onClickCapture?.();
          }}
          className={S.UpsellCTALink}
        >
          {buttonText}
        </UnstyledButton>
      ),
    )
    .with(
      {
        onClick: P.any,
        buttonLink: P.nonNullable,
        internalLink: P.nullish,
      },
      () => (
        <ExternalLink
          onClickCapture={onClickCapture}
          href={url}
          className={S.UpsellCTALink}
        >
          {buttonText}
        </ExternalLink>
      ),
    )
    .with(
      {
        onClick: P.any,
        buttonLink: P.any,
        internalLink: P.nonNullable,
      },
      (args) => (
        <Link
          onClickCapture={onClickCapture}
          to={args.internalLink}
          className={S.UpsellCTALink}
        >
          {buttonText}
        </Link>
      ),
    )
    .otherwise(() => null);
}
