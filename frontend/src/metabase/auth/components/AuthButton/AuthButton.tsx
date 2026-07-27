import cx from "classnames";
import type { ComponentPropsWithoutRef, FunctionComponent } from "react";

import type { LinkProps } from "metabase/router";
import { Link } from "metabase/router";
import type { AnchorProps, CardProps, UnstyledButtonProps } from "metabase/ui";
import { Anchor, Card, UnstyledButton } from "metabase/ui";

import S from "./AuthButton.module.css";

type AuthButtonProps = UnstyledButtonProps & ComponentPropsWithoutRef<"button">;

export function AuthTextButton({ className, ...props }: AuthButtonProps) {
  return <UnstyledButton className={cx(S.link, className)} {...props} />;
}

export function AuthCardButton({ className, ...props }: AuthButtonProps) {
  return (
    <UnstyledButton className={cx(S.link, S.card, className)} {...props} />
  );
}

type AuthTextLinkProps = AnchorProps & Omit<LinkProps, "ref">;

export function AuthTextLink({ className, ...props }: AuthTextLinkProps) {
  return (
    <Anchor<FunctionComponent<LinkProps>>
      component={Link}
      className={cx(S.link, className)}
      underline="never"
      {...props}
    />
  );
}

type AuthCardLinkProps = CardProps & Omit<LinkProps, "ref">;

export function AuthCardLink({ className, ...props }: AuthCardLinkProps) {
  return (
    <Card<FunctionComponent<LinkProps>>
      component={Link}
      className={cx(S.link, S.card, className)}
      {...props}
    />
  );
}
