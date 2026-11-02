import cx from "classnames";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { Icon, UnstyledButton } from "metabase/ui";

import S from "./MetabotSendButton.module.css";

type MetabotSendButtonProps = ComponentPropsWithoutRef<"button"> & {
  isResponding?: boolean;
  isHidden?: boolean;
};

export const MetabotSendButton = forwardRef<
  HTMLButtonElement,
  MetabotSendButtonProps
>(function MetabotSendButton(
  { isResponding = false, isHidden = false, className, ...props },
  ref,
) {
  return (
    <UnstyledButton
      ref={ref}
      className={cx(S.button, className, {
        [S.buttonResponding]: isResponding,
        [S.buttonHidden]: isHidden,
      })}
      data-testid={
        isResponding ? "metabot-stop-response" : "metabot-send-message"
      }
      {...props}
    >
      {isResponding ? (
        <Icon className={S.stopIcon} name="stop" />
      ) : (
        <Icon className={S.sendIcon} name="arrow_up" />
      )}
    </UnstyledButton>
  );
});
