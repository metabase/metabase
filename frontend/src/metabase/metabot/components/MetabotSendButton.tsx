import cx from "classnames";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { t } from "ttag";

import { ActionIcon, Icon } from "metabase/ui";

import S from "./MetabotSendButton.module.css";

type MetabotSendButtonProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "color"
> & {
  isResponding?: boolean;
  isHidden?: boolean;
};

/**
 * Metabot's send button, which becomes a stop button while Metabot is
 * responding. When `isHidden` is set it stays in the layout but is invisible,
 * can't be focused or clicked, and is hidden from screen readers.
 */
export const MetabotSendButton = forwardRef<
  HTMLButtonElement,
  MetabotSendButtonProps
>(function MetabotSendButton(
  { isResponding = false, isHidden = false, className, ...props },
  ref,
) {
  return (
    <ActionIcon
      ref={ref}
      variant={isResponding ? "light" : "filled"}
      className={cx(S.button, className, { [S.hidden]: isHidden })}
      aria-label={isResponding ? t`Stop generating` : t`Send message`}
      inert={isHidden}
      data-testid={
        isResponding ? "metabot-stop-response" : "metabot-send-message"
      }
      {...props}
    >
      <Icon name={isResponding ? "stop" : "arrow_up"} />
    </ActionIcon>
  );
});
